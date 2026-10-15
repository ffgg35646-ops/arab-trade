import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";

import InvestmentPackage from "@/models/InvestmentPackage";
import UserPackage from "@/models/UserPackage";
import DepositBalance from "@/models/DepositBalance";
import PackageLedger from "@/models/PackageLedger";
import { ensureDefaultInvestmentPackages } from "@/lib/ensure-default-investment-packages";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import PlatformSettings from "@/models/PlatformSettings";
import { normalizeMissedPackageCollectionWindows } from "@/lib/package-collection-window";
import { USDT_ASSET } from "@/lib/unified-usdt-wallet";
import { debitDepositBalance, normalizeDepositBalanceRows, separateLegacyDepositsFromSpotWallet } from "@/lib/deposit-balance-source";
import { ensurePackagePrincipalWithdrawalCredit } from "@/lib/ensure-package-principal-withdrawal";

const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });

    await connectDB();
    await separateLegacyDepositsFromSpotWallet(user._id);
    await Promise.all([
      UserPackage.updateMany({ userId: user._id, asset: { $ne: USDT_ASSET } }, { $set: { asset: USDT_ASSET } }),
      PackageLedger.updateMany({ userId: user._id, asset: { $ne: USDT_ASSET } }, { $set: { asset: USDT_ASSET } }),
      WithdrawalRequest.updateMany({ userId: user._id, source: "package", asset: { $ne: USDT_ASSET } }, { $set: { asset: USDT_ASSET } }),
    ]);
    await ensureDefaultInvestmentPackages();
    await normalizeMissedPackageCollectionWindows({ userId: user._id });
    const [packages, allPlansForProfit, rawDepositBalances, settings, referredUsers] = await Promise.all([
      InvestmentPackage.find({ enabled: true }).sort({ sortOrder: 1, price: 1 }).lean(),
      InvestmentPackage.find({}).select("_id dailyProfit").lean(),
      DepositBalance.find({ userId: user._id }).sort({ asset: 1 }).lean(),
      PlatformSettings.findOne({ key: "global" }).lean(),
      User.find({ referredBy: user._id }).select("_id").lean(),
    ]);
    await ensurePackagePrincipalWithdrawalCredit(
      user._id,
      Number(settings?.withdrawals?.firstPackageWithdrawalPercent ?? 100)
    );
    const [rawUserPackages, packageLedger] = await Promise.all([
      UserPackage.find({ userId: user._id }).sort({ createdAt: -1 }).limit(100).lean(),
      PackageLedger.find({ userId: user._id })
        .populate("userPackageId", "packageName")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
    ]);
    const depositBalances = normalizeDepositBalanceRows(rawDepositBalances as any[]);
    const referredIds = referredUsers.map((item: any) => item._id);
    const packageMinimumRows = await InvestmentPackage.find({})
      .select("_id minimumWithdrawal")
      .lean();
    const configuredMinimums = settings?.withdrawals?.withdrawalMinByPackage as unknown as Record<string, number> | undefined;
    const minimumWithdrawalByPlan = new Map(
      (packageMinimumRows as any[]).map((plan) => [
        String(plan._id),
        Number(configuredMinimums?.[String(plan._id)] ?? plan.minimumWithdrawal ?? 100),
      ])
    );

    const countedWithdrawalStatuses = ["pending", "approved", "processing", "completed"] as const;
    const unresolvedWithdrawalStatuses = ["pending"] as const;
    const [activeReferralDeposits, referralWithdrawalRows, firstWithdrawalRows, unresolvedPackageWithdrawalRows] = await Promise.all([
      referredIds.length
        ? DepositRequest.aggregate([
            { $match: { userId: { $in: referredIds }, status: "approved", asset: "USDT" } },
            { $group: { _id: "$userId", total: { $sum: "$amount" } } },
          ])
        : Promise.resolve([]),
      WithdrawalRequest.find({
        userId: user._id,
        source: "package",
        isFirstPackageWithdrawal: { $ne: true },
        status: { $in: countedWithdrawalStatuses },
      }).select("userPackageId amount").lean(),
      WithdrawalRequest.find({
        userId: user._id,
        source: "package",
        isFirstPackageWithdrawal: true,
        status: { $in: countedWithdrawalStatuses },
      }).select("userPackageId amount status").lean(),
      WithdrawalRequest.find({
        userId: user._id,
        source: "package",
        status: { $in: unresolvedWithdrawalStatuses },
      }).select("userPackageId status amount createdAt").sort({ createdAt: -1 }).lean(),
    ]);

    const activeReferralCount = activeReferralDeposits.length;
    const activeReferralDepositTotal = activeReferralDeposits.reduce(
      (sum: number, row: any) => sum + Number(row.total || 0), 0
    );
    const firstPackageWithdrawalPercent = Math.max(0, Math.min(100, Number(settings?.withdrawals?.firstPackageWithdrawalPercent ?? 100)));
    const referralPackageWithdrawalPercent = Math.max(0, Math.min(100, Number(settings?.withdrawals?.referralPackageWithdrawalPercent ?? 50)));
    // Referral-deposit capacity is user-wide, so the same referral deposits
    // cannot unlock repeated withdrawal limits across multiple package accounts.
    const referralAlreadyWithdrawnTotal = (referralWithdrawalRows as any[]).reduce(
      (sum: number, row: any) => sum + Number(row.amount || 0),
      0
    );
    const firstWithdrawalByPackage = new Map<string, number>();
    const firstWithdrawalPendingPackages = new Set<string>();
    const unresolvedWithdrawalByPackage = new Map<string, any>();
    for (const row of unresolvedPackageWithdrawalRows as any[]) {
      const key = String(row.userPackageId || "");
      if (key && !unresolvedWithdrawalByPackage.has(key)) unresolvedWithdrawalByPackage.set(key, row);
    }
    for (const row of firstWithdrawalRows as any[]) {
      const key = String(row.userPackageId || "");
      firstWithdrawalByPackage.set(key, (firstWithdrawalByPackage.get(key) || 0) + Number(row.amount || 0));
      if (String(row.status) === "pending") {
        firstWithdrawalPendingPackages.add(key);
      }
    }
    const dailyProfitByPackage = new Map(
      (allPlansForProfit as any[]).map((plan) => [String(plan._id), Math.max(0, Number(plan.dailyProfit || 0))])
    );
    const collectionNow = Date.now();
    const userPackages = rawUserPackages.map((item: any) => {
      const anchor = item.lastProfitAt ? new Date(item.lastProfitAt).getTime() : new Date(item.activatedAt || collectionNow).getTime();
      const nextCollectAt = anchor + 24 * 60 * 60 * 1000;
      const collectWindowEndsAt = nextCollectAt + 30 * 60 * 1000;
      const dailyProfit = dailyProfitByPackage.get(String(item.packageId)) || 0;
      const collectWindowOpen = item.status === "active" && collectionNow >= nextCollectAt && collectionNow <= collectWindowEndsAt;
      const packageKey = String(item._id);
      const referralCap = activeReferralDepositTotal * referralPackageWithdrawalPercent / 100;
      const referralAlreadyWithdrawn = referralAlreadyWithdrawnTotal;
      const referralRemaining = Math.max(0, referralCap - referralAlreadyWithdrawn);
      const firstPackageWithdrawalCap = Math.max(0, Number(item.investedAmount || 0) * firstPackageWithdrawalPercent / 100);
      const firstPackageWithdrawalUsed = firstWithdrawalByPackage.get(packageKey) || 0;
      const firstPackageWithdrawalRemaining = Math.max(0, firstPackageWithdrawalCap - firstPackageWithdrawalUsed);
      const firstPackageWithdrawalPending = firstWithdrawalPendingPackages.has(packageKey);
      const unresolvedPackageWithdrawal = unresolvedWithdrawalByPackage.get(packageKey) || null;
      const packageWithdrawalPending = item.withdrawalRequestPending === true || Boolean(unresolvedPackageWithdrawal);
      // Package principal caps only phase one. After it is fully withdrawn,
      // the remaining allowance comes from 50% of active referral deposits.
      const packageWithdrawalCap = firstPackageWithdrawalCap;
      const packageWithdrawalUsed = firstPackageWithdrawalUsed;
      const packageWithdrawalRemaining = firstPackageWithdrawalRemaining;
      const availableEarnings = Math.max(0, Number(item.availableEarnings || 0));
      const phaseWithdrawalLimit = packageWithdrawalPending || firstPackageWithdrawalPending
        ? 0
        : Math.min(availableEarnings, firstPackageWithdrawalRemaining > 0
          ? firstPackageWithdrawalRemaining
          : referralRemaining);
      const withdrawalLimit = phaseWithdrawalLimit;
      return {
        ...item,
        firstPackageWithdrawalCap,
        firstPackageWithdrawalUsed,
        firstPackageWithdrawalRemaining,
        firstPackageWithdrawalPending,
        packageWithdrawalPending,
        unresolvedWithdrawalAmount: unresolvedPackageWithdrawal ? Number(unresolvedPackageWithdrawal.amount || 0) : null,
        unresolvedWithdrawalStatus: unresolvedPackageWithdrawal ? String(unresolvedPackageWithdrawal.status) : null,
        packageWithdrawalCap,
        packageWithdrawalUsed,
        packageWithdrawalRemaining,
        dailyProfit,
        nextCollectAt: new Date(nextCollectAt).toISOString(),
        collectWindowEndsAt: new Date(collectWindowEndsAt).toISOString(),
        collectWindowOpen,
        minimumWithdrawal: minimumWithdrawalByPlan.get(String(item.packageId)) ?? Number(settings?.withdrawals?.minAmount ?? 0),
        activeReferralCount,
        activeReferralDepositTotal,
        firstPackageWithdrawalPercent,
        referralPackageWithdrawalPercent,
        referralWithdrawalCap: referralCap,
        referralAlreadyWithdrawn,
        referralRemaining,
        withdrawalLimit,
      };
    });

    return NextResponse.json({
      success: true,
      packages: packages.map((plan: any) => ({ ...plan, minimumWithdrawal: Number(configuredMinimums?.[String(plan._id)] ?? plan.minimumWithdrawal ?? 100), asset: USDT_ASSET, durationDays: 0, dailyProfit: Number(plan.dailyProfit || 0) })),
      depositBalances,
      userPackages,
      packageLedger: packageLedger.map((row: any) => ({
        ...row,
        _id: String(row._id),
        userPackageId: row.userPackageId ? {
          _id: String(row.userPackageId._id),
          packageName: row.userPackageId.packageName,
        } : null,
      })),
      policy: {
        dailyReturnsAutomatic: false,
        collectionWindowMinutes: 30,
        earningsNotice: "يصبح الربح اليومي متاحًا للجمع بعد اكتمال 24 ساعة، وتستمر فرصة الجمع 30 دقيقة فقط. إذا انتهت المهلة دون جمع، يسقط ربح الدورة وتبدأ دورة جديدة؛ والباقة نفسها مستمرة دون مدة انتهاء.",
        singleActivePackageNotice: "يسمح لكل مستخدم بباقة نشطة واحدة فقط.",
        activationSourceNotice: "تفعيل الباقات يتم من رصيد الإيداع المنفصل بعملة USDT، ولا يُضاف إلى رصيد السحب العام.",
        cancellationNotice: "عند التغيير إلى باقة أخرى، يضاف 50% من قيمة تفعيل الباقة السابقة إلى رصيد السحب الخاص بالباقة السابقة نفسها. تظل الأرباح المجمعة في سجل هذه الباقة، ويُخصم سعر الباقة الجديدة من رصيد الإيداع.",
      },
    });
  } catch (error) {
    console.error("PACKAGES GET:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل الباقات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });

    await connectDB();
    await separateLegacyDepositsFromSpotWallet(user._id);
    const withdrawalSettings = await PlatformSettings.findOne({ key: "global" }).select("withdrawals.firstPackageWithdrawalPercent").lean();
    await ensurePackagePrincipalWithdrawalCredit(
      user._id,
      Number((withdrawalSettings as any)?.withdrawals?.firstPackageWithdrawalPercent ?? 100)
    );
    await Promise.all([
      UserPackage.updateMany({ userId: user._id, asset: { $ne: USDT_ASSET } }, { $set: { asset: USDT_ASSET } }),
      PackageLedger.updateMany({ userId: user._id, asset: { $ne: USDT_ASSET } }, { $set: { asset: USDT_ASSET } }),
      WithdrawalRequest.updateMany({ userId: user._id, source: "package", asset: { $ne: USDT_ASSET } }, { $set: { asset: USDT_ASSET } }),
    ]);
    const body = await request.json();
    const action = String(body.action || "");
    const packageId = String(body.packageId || "").trim();
    const userPackageId = String(body.userPackageId || "").trim();

    if (action === "collect") {
      if (!mongoose.Types.ObjectId.isValid(userPackageId)) {
        return NextResponse.json({ success: false, message: "معرف الباقة غير صحيح" }, { status: 400 });
      }

      await normalizeMissedPackageCollectionWindows({ userId: user._id });
      const current = await UserPackage.findOne({
        _id: userPackageId,
        userId: user._id,
        status: "active",
      }).lean();
      if (!current) {
        return NextResponse.json({ success: false, message: "لا توجد باقة نشطة بهذا المعرف" }, { status: 404 });
      }

      const anchor = current.lastProfitAt ? new Date(current.lastProfitAt) : new Date(current.activatedAt);
      const now = new Date();
      const elapsed = now.getTime() - anchor.getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      const windowMs = 30 * 60 * 1000;
      if (elapsed < dayMs) {
        return NextResponse.json({ success: false, message: "لم يكتمل عداد الـ24 ساعة بعد." }, { status: 409 });
      }
      if (elapsed > dayMs + windowMs) {
        await normalizeMissedPackageCollectionWindows({ userId: user._id });
        return NextResponse.json({ success: false, message: "انتهت مهلة الجمع لهذا اليوم وفُقد ربح الدورة. انتظر موعد الجمع التالي." }, { status: 409 });
      }

      const plan = await InvestmentPackage.findById(current.packageId).select("dailyProfit").lean();
      const dailyProfit = roundAmount(Math.max(0, Number(plan?.dailyProfit || 0)));
      const nextAnchor = new Date(anchor.getTime() + dayMs);
      const session = await mongoose.startSession();
      let collected: any = null;
      try {
        await session.withTransaction(async () => {
          const update: Record<string, any> = { $set: { lastProfitAt: nextAnchor } };
          if (dailyProfit > 0) {
            update.$inc = {
              availableEarnings: dailyProfit,
              totalRealizedEarnings: dailyProfit,
            };
          }
          collected = await UserPackage.findOneAndUpdate(
            {
              _id: current._id,
              userId: user._id,
              status: "active",
              lastProfitAt: anchor,
            },
            update,
            { new: true, session }
          );
          if (!collected) throw new Error("COLLECTION_WINDOW_ALREADY_USED");
          if (dailyProfit > 0) {
            await PackageLedger.create([{
              userId: user._id,
              userPackageId: current._id,
              type: "daily_earning",
              asset: current.asset || USDT_ASSET,
              amount: dailyProfit,
              note: "جمع الربح اليومي يدويًا خلال مهلة 30 دقيقة",
            }], { session });
          }
        });
      } catch (collectError) {
        const conflict = collectError instanceof Error && collectError.message === "COLLECTION_WINDOW_ALREADY_USED";
        if (!conflict) console.error("PACKAGE EARNINGS COLLECTION:", collectError);
        return NextResponse.json({
          success: false,
          message: conflict ? "تم جمع ربح هذه الدورة بالفعل أو تغيّرت حالة الباقة. حدّث الصفحة." : "تعذر تسجيل الجمع؛ لم يتم تغيير الرصيد.",
        }, { status: conflict ? 409 : 500 });
      } finally {
        await session.endSession();
      }

      return NextResponse.json({
        success: true,
        message: dailyProfit > 0
          ? "تم جمع " + dailyProfit + " " + (current.asset || USDT_ASSET) + " وإضافتها إلى رصيد سحب هذه الباقة."
          : "تم إغلاق دورة الجمع؛ الربح اليومي المحدد لهذه الباقة يساوي صفرًا.",
        userPackage: collected,
      });
    }



    // Activation only debits the new package; refunds are handled by change/cancel actions.
    if (action === "activate") {
      if (!mongoose.Types.ObjectId.isValid(packageId)) {
        return NextResponse.json({ success: false, message: "الباقة غير صحيحة" }, { status: 400 });
      }

      const plan = await InvestmentPackage.findOne({ _id: packageId, enabled: true }).lean();
      if (!plan) return NextResponse.json({ success: false, message: "الباقة غير موجودة أو متوقفة" }, { status: 404 });

      const activePackage = await UserPackage.findOne({ userId: user._id, status: "active" }).lean();
      if (activePackage) {
        return NextResponse.json({
          success: false,
          message: "لديك باقة نشطة بالفعل. استخدم «التغيير إلى هذه الباقة» لنقل 50% من قيمة تفعيلها إلى رصيد سحب الباقة الحالية.",
        }, { status: 409 });
      }

      const price = Number(plan.price);
      const asset = USDT_ASSET;
      const session = await mongoose.startSession();
      let purchased: any = null;
      let availableDepositBefore = 0;
      try {
        await session.withTransaction(async () => {
          // Check inside the same transaction to protect against concurrent activations.
          const existing = await UserPackage.findOne({ userId: user._id, status: "active" }).session(session);
          if (existing) throw new Error("ACTIVE_PACKAGE_EXISTS");

          const debit = await debitDepositBalance(user._id, asset, price, session);
          availableDepositBefore = debit.availableBefore;
          if (!debit.ok) throw new Error("INSUFFICIENT_DEPOSIT_BALANCE");

          await LedgerEntry.create([{
            userId: user._id, scope: "user", asset: USDT_ASSET, mode: "live",
            type: "adjustment", amount: -price,
            balanceBefore: debit.availableBefore, balanceAfter: roundAmount(debit.availableBefore - price),
            referenceId: "separate-deposit-spend:package-activation:" + String(plan._id) + ":" + String(user._id) + ":" + String(Date.now()),
            note: "خصم تفعيل باقة " + plan.name + " من رصيد الإيداع المنفصل.",
          }], { session });

          const created = await UserPackage.create([{
            userId: user._id, packageId: plan._id, packageName: plan.name,
            investedAmount: price, asset: USDT_ASSET, durationDays: 0, lastProfitAt: new Date(),
            status: "active", availableEarnings: price, lockedEarnings: 0,
            totalRealizedEarnings: 0, totalWithdrawn: 0,
            withdrawablePrincipalCredited: true,
            cancellationRefund: 0, activatedAt: new Date(),
          }], { session });
          purchased = created[0];
          await PackageLedger.create([
            {
              userId: user._id, userPackageId: purchased._id,
              type: "activation", asset, amount: -price,
              note: "تفعيل باقة " + plan.name + " من رصيد الإيداع",
            },
            {
              userId: user._id, userPackageId: purchased._id,
              type: "activation_withdrawable", asset, amount: price,
              note: "إضافة قيمة تفعيل الباقة إلى رصيد السحب المتاح للمرحلة الأولى.",
            },
          ], { session, ordered: true });
        });
      } catch (activationError) {
        console.error("PACKAGE ACTIVATION:", activationError);
        const code = activationError instanceof Error ? activationError.message : "";
        return NextResponse.json({
          success: false,
          message: code === "ACTIVE_PACKAGE_EXISTS"
            ? "لديك باقة نشطة بالفعل؛ ألغها قبل تفعيل باقة أخرى."
            : code === "INSUFFICIENT_DEPOSIT_BALANCE"
              ? "رصيد الإيداع المتاح حاليًا هو " + availableDepositBefore + " " + asset + "، وتحتاج إلى " + price + " " + asset + " لتفعيل هذه الباقة."
              : "لم يتم تفعيل الباقة أو خصم الرصيد لأن المعاملة المالية لم تكتمل.",
        }, { status: code === "ACTIVE_PACKAGE_EXISTS" ? 409 : code === "INSUFFICIENT_DEPOSIT_BALANCE" ? 400 : 500 });
      } finally {
        await session.endSession();
      }

      return NextResponse.json({
        success: true,
        message: "تم تفعيل الباقة من رصيد الإيداع المنفصل.",
        userPackage: purchased,
      }, { status: 201 });
    }

    if (action === "change") {
      if (!mongoose.Types.ObjectId.isValid(packageId) || !mongoose.Types.ObjectId.isValid(userPackageId)) {
        return NextResponse.json({ success: false, message: "اختر الباقة الحالية والباقة الجديدة بصورة صحيحة" }, { status: 400 });
      }

      const [plan, current] = await Promise.all([
        InvestmentPackage.findOne({ _id: packageId, enabled: true }).lean(),
        UserPackage.findOne({ _id: userPackageId, userId: user._id, status: "active" }).lean(),
      ]);
      if (!plan) return NextResponse.json({ success: false, message: "الباقة الجديدة غير موجودة أو متوقفة" }, { status: 404 });
      if (!current) return NextResponse.json({ success: false, message: "الباقة الحالية ليست نشطة أو لا تخص هذا المستخدم" }, { status: 404 });
      if (Number(current.lockedEarnings || 0) > 0) {
        return NextResponse.json({ success: false, message: "لا يمكن تغيير الباقة بينما يوجد طلب سحب من أرباحها قيد المراجعة." }, { status: 409 });
      }

      const price = Number(plan.price);
      const asset = USDT_ASSET;
      const refund = roundAmount(Number(current.investedAmount || 0) * 0.5);
      const session = await mongoose.startSession();
      let changedPackage: any = null;
      let availableDepositBefore = 0;

      try {
        await session.withTransaction(async () => {
          // Enforce the one-active-package rule inside the transaction as well,
          // including protection against concurrent package changes.
          const activePackages = await UserPackage.find({ userId: user._id, status: "active" })
            .select("_id")
            .session(session)
            .lean();
          if (activePackages.length !== 1 || String(activePackages[0]?._id) !== String(current._id)) {
            throw new Error("MULTIPLE_ACTIVE_PACKAGES");
          }

          const stillEnabled = await InvestmentPackage.findOne({ _id: plan._id, enabled: true }).session(session);
          if (!stillEnabled) throw new Error("TARGET_PACKAGE_DISABLED");

          const cancelled = await UserPackage.findOneAndUpdate(
            { _id: current._id, userId: user._id, status: "active", lockedEarnings: 0 },
            { $set: { status: "cancelled", cancelledAt: new Date(), cancellationRefund: refund } },
            { new: true, session }
          );
          if (!cancelled) throw new Error("CURRENT_PACKAGE_CHANGED");

          const debit = await debitDepositBalance(user._id, asset, price, session);
          availableDepositBefore = debit.availableBefore;
          if (!debit.ok) throw new Error("INSUFFICIENT_DEPOSIT_BALANCE");

          // Credit the 50% refund to the cancelled package's own withdrawal balance.
          // This keeps each package's withdrawal account separate from the general wallet.
          if (refund > 0) {
            const creditedPackage = await UserPackage.findOneAndUpdate(
              { _id: cancelled._id, userId: user._id, status: "cancelled" },
              { $inc: { availableEarnings: refund } },
              { new: true, session }
            );
            if (!creditedPackage) throw new Error("PACKAGE_REFUND_CREDIT_FAILED");
          }

          await LedgerEntry.create([{
            userId: user._id, scope: "user", asset: USDT_ASSET, mode: "live",
            type: "adjustment", amount: -price,
            balanceBefore: debit.availableBefore, balanceAfter: roundAmount(debit.availableBefore - price),
            referenceId: "separate-deposit-spend:package-change-debit:" + String(cancelled._id) + ":" + String(plan._id) + ":" + String(Date.now()),
            note: "خصم تفعيل الباقة الجديدة " + plan.name + " من رصيد الإيداع المنفصل.",
          }], { session });

          const created = await UserPackage.create([{
            userId: user._id,
            packageId: plan._id,
            packageName: plan.name,
            investedAmount: price,
            asset,
            durationDays: 0,
            lastProfitAt: new Date(),
            status: "active",
            availableEarnings: price,
            lockedEarnings: 0,
            totalRealizedEarnings: 0,
            totalWithdrawn: 0,
            withdrawablePrincipalCredited: true,
            firstWithdrawalStatus: "available",
            cancellationRefund: 0,
            activatedAt: new Date(),
          }], { session });
          changedPackage = created[0];

          await PackageLedger.create([
            {
              userId: user._id,
              userPackageId: cancelled._id,
              type: "cancellation_refund",
              asset: cancelled.asset || USDT_ASSET,
              amount: refund,
              note: "تغيير الباقة: استرداد 50% من قيمة تفعيل " + cancelled.packageName + " إلى رصيد سحب الباقة نفسها.",
            },
            {
              userId: user._id,
              userPackageId: changedPackage._id,
              type: "activation",
              asset,
              amount: -price,
              note: "تفعيل باقة " + plan.name + " من رصيد الإيداع عند تغيير الباقة",
            },
            {
              userId: user._id,
              userPackageId: changedPackage._id,
              type: "activation_withdrawable",
              asset,
              amount: price,
              note: "إضافة قيمة تفعيل الباقة الجديدة إلى رصيد السحب المتاح للمرحلة الأولى.",
            },
          ], { session, ordered: true });
        });
      } catch (changeError) {
        const code = changeError instanceof Error ? changeError.message : "";
        if (code === "MULTIPLE_ACTIVE_PACKAGES") {
          return NextResponse.json({
            success: false,
            message: "يجب أن تكون لديك باقة نشطة واحدة فقط قبل التغيير. ألغِ أي باقات نشطة زائدة أولًا؛ لن يتغير أي رصيد تلقائيًا.",
          }, { status: 409 });
        }
        if (code === "INSUFFICIENT_DEPOSIT_BALANCE" || code === "CURRENT_PACKAGE_CHANGED" || code === "TARGET_PACKAGE_DISABLED") {
          const status = code === "INSUFFICIENT_DEPOSIT_BALANCE" ? 400 : 409;
          const message = code === "INSUFFICIENT_DEPOSIT_BALANCE"
            ? "رصيد الإيداع المتاح حاليًا هو " + availableDepositBefore + " " + asset + "، وتحتاج إلى " + price + " " + asset + " للباقة الجديدة. لم يتم إلغاء الباقة الحالية أو تغيير أي رصيد."
            : code === "TARGET_PACKAGE_DISABLED"
              ? "الباقة الجديدة توقفت أثناء العملية؛ لم يتم تغيير الأرصدة."
              : "حالة الباقة الحالية تغيرت؛ حدّث الصفحة قبل المحاولة مرة أخرى.";
          return NextResponse.json({ success: false, message }, { status });
        }
        console.error("PACKAGE CHANGE:", changeError);
        return NextResponse.json({ success: false, message: "فشل تغيير الباقة، وتم التراجع عن جميع تغييرات الأرصدة." }, { status: 500 });
      } finally {
        await session.endSession();
      }

      return NextResponse.json({
        success: true,
        message: "تم تغيير الباقة بنجاح. أُضيف 50% من قيمة تفعيل الباقة السابقة إلى رصيد سحبها الخاص، وخُصمت قيمة الباقة الجديدة من رصيد الإيداع.",
        userPackage: changedPackage,
        cancellationRefund: refund,
      });
    }

    if (action === "cancel") {
      if (!mongoose.Types.ObjectId.isValid(userPackageId)) {
        return NextResponse.json({ success: false, message: "معرف الباقة غير صحيح" }, { status: 400 });
      }

      const current = await UserPackage.findOne({
        _id: userPackageId,
        userId: user._id,
        status: "active",
      });

      if (!current) {
        return NextResponse.json({ success: false, message: "لا توجد باقة نشطة بهذا المعرف" }, { status: 404 });
      }

      if (Number(current.lockedEarnings || 0) > 0) {
        return NextResponse.json({
          success: false,
          message: "لا يمكن إلغاء الباقة بينما يوجد طلب سحب من أرباحها قيد المراجعة.",
        }, { status: 409 });
      }

      const refund = roundAmount(Number(current.investedAmount || 0) * 0.5);
      const session = await mongoose.startSession();
      let cancelledPackage: any = null;

      try {
        await session.withTransaction(async () => {
          const cancelled = await UserPackage.findOneAndUpdate(
            { _id: current._id, userId: user._id, status: "active", lockedEarnings: 0 },
            { $set: { status: "cancelled", cancelledAt: new Date(), cancellationRefund: refund } },
            { new: true, session }
          );

          if (!cancelled) {
            throw new Error("PACKAGE_ALREADY_CANCELLED");
          }

          if (refund > 0) {
            const creditedPackage = await UserPackage.findOneAndUpdate(
              { _id: cancelled._id, userId: user._id, status: "cancelled" },
              { $inc: { availableEarnings: refund } },
              { new: true, session }
            );
            if (!creditedPackage) throw new Error("PACKAGE_REFUND_CREDIT_FAILED");
          }

          await PackageLedger.create([{
            userId: user._id,
            userPackageId: cancelled._id,
            type: "cancellation_refund",
            asset: cancelled.asset,
            amount: refund,
            note: "تم إلغاء الباقة وإضافة نصف قيمة تفعيلها إلى رصيد سحب الباقة نفسها",
          }], { session });

          cancelledPackage = cancelled;
        });
      } catch (cancelError) {
        console.error("PACKAGE CANCEL:", cancelError);
        const conflict = cancelError instanceof Error && cancelError.message === "PACKAGE_ALREADY_CANCELLED";
        return NextResponse.json({
          success: false,
          message: conflict
            ? "تم تغيير حالة الباقة بالفعل. حدّث الصفحة قبل المحاولة مرة أخرى."
            : "لم يتم إلغاء الباقة أو تغيير الأرصدة لأن المعاملة المالية لم تكتمل. حاول مرة أخرى.",
        }, { status: conflict ? 409 : 500 });
      } finally {
        await session.endSession();
      }

      return NextResponse.json({
        success: true,
        message: "تم إلغاء الباقة وإضافة " + refund + " " + current.asset + " إلى رصيد سحب الباقة نفسها. تبقى الأرباح المحققة في رصيد هذه الباقة.",
        userPackage: cancelledPackage,
      });
    }

    return NextResponse.json({ success: false, message: "الإجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("PACKAGES POST:", error);
    return NextResponse.json({ success: false, message: "تعذر تنفيذ عملية الباقة" }, { status: 500 });
  }
}
