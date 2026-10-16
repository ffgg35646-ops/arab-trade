import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Asset from "@/models/Asset";
import PaymentOption from "@/models/PaymentOption";
import PackageWithdrawalMethod from "@/models/PackageWithdrawalMethod";
import Wallet from "@/models/Wallet";
import Notification from "@/models/Notification";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import { rateLimit } from "@/lib/rate-limit";
import UserPackage from "@/models/UserPackage";
import InvestmentPackage from "@/models/InvestmentPackage";
import PackageLedger from "@/models/PackageLedger";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";
import { accrueDuePackageEarnings } from "@/lib/accrue-package-earnings";
import { normalizePaymentNetwork, USDT_ASSET } from "@/lib/unified-usdt-wallet";
import { separateLegacyDepositsFromSpotWallet } from "@/lib/deposit-balance-source";
import { ensurePackagePrincipalWithdrawalCredit } from "@/lib/ensure-package-principal-withdrawal";
import { settleLegacyApprovedPackageWithdrawals } from "@/lib/settle-legacy-approved-package-withdrawals";

function normalizeAsset(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

async function restoreLockedPackageAllocations(
  userId: mongoose.Types.ObjectId,
  primaryPackageId: string,
  allocations: Array<{ userPackageId: mongoose.Types.ObjectId | string; amount: number }>,
  isFirstPackageWithdrawal: boolean,
) {
  for (const allocation of allocations) {
    await UserPackage.updateOne(
      { _id: allocation.userPackageId, userId },
      {
        $inc: { availableEarnings: allocation.amount, lockedEarnings: -allocation.amount },
        $set: { withdrawalRequestPending: false },
      },
    );
  }

  await UserPackage.updateOne(
    { _id: primaryPackageId, userId },
    {
      $set: {
        withdrawalRequestPending: false,
        ...(isFirstPackageWithdrawal ? { firstWithdrawalStatus: "available" } : {}),
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const clientKey =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const limiter = rateLimit(
    "withdrawals:" + clientKey,
    20,
    60000
  );

  if (!limiter.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "تم تجاوز عدد الطلبات المسموح بها مؤقتًا",
        retryAfter: Math.max(
          0,
          Math.ceil(
            (limiter.resetAt - Date.now()) / 1000
          )
        ),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(
              1,
              Math.ceil(
                (limiter.resetAt - Date.now()) / 1000
              )
            )
          ),
        },
      }
    );
  }

  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مسجل الدخول",
        },
        { status: 401 }
      );
    }

    await connectDB();

    const withdrawals =
      await WithdrawalRequest.find({
        userId: user._id,
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

    return NextResponse.json({
      success: true,
      withdrawals,
    });
  } catch (error) {
    console.error("WITHDRAWALS GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل السحوبات",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مسجل الدخول",
        },
        { status: 401 }
      );
    }

    await connectDB();
    await settleLegacyApprovedPackageWithdrawals(user._id);

    const existingPendingWithdrawal = await WithdrawalRequest.findOne({
      userId: user._id,
      status: "pending",
    }).select("_id amount asset source createdAt").sort({ createdAt: -1 }).lean();

    if (existingPendingWithdrawal) {
      return NextResponse.json(
        {
          success: false,
          message: "لديك طلب سحب قائم قيد المراجعة بالفعل. لا يمكنك تقديم طلب سحب جديد من المحفظة العامة أو أي باقة حتى تعتمد الإدارة الطلب الحالي أو ترفضه.",
          activeWithdrawalId: String(existingPendingWithdrawal._id),
          activeWithdrawalAmount: Number(existingPendingWithdrawal.amount || 0),
          activeWithdrawalSource: existingPendingWithdrawal.source || "wallet",
        },
        { status: 409 }
      );
    }

    await separateLegacyDepositsFromSpotWallet(user._id);
    await accrueDuePackageEarnings({ userId: user._id });

    const settings = await getPlatformSettings();

    if (!settings.withdrawals.enabled) {
      return NextResponse.json(
        {
          success: false,
          message: "السحب متوقف حاليًا",
        },
        { status: 403 }
      );
    }

    if (
      settings.withdrawals.requireEmailVerification &&
      !user.isVerified
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "يجب تأكيد البريد الإلكتروني قبل السحب",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const assetCode = String(body.asset || "").trim().toUpperCase();
    const networkCode = normalizePaymentNetwork(body.network);

    const address = String(body.address || "")
      .trim();

    const amount = Number(body.amount);
    const source = body.source === "package" ? "package" : "wallet";
    const userPackageId = String(body.userPackageId || "").trim();
    if (source === "package") {
      await ensurePackagePrincipalWithdrawalCredit(
        user._id,
        Number(settings.withdrawals.firstPackageWithdrawalPercent ?? 100)
      );
    }

    if (
      assetCode !== USDT_ASSET ||
      !networkCode ||
      !address ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "بيانات السحب غير مكتملة",
        },
        { status: 400 }
      );
    }

    /*
     * نبحث أولًا عن وسيلة الدفع التي أنشأها الأدمن.
     */
    // General-wallet withdrawals and package withdrawals read different method records.
    // A general method must never satisfy or configure a package withdrawal.
    let payment: any = null;
    if (source === "package") {
      const packageCandidates = await PackageWithdrawalMethod.find({ asset: USDT_ASSET }).lean();
      payment = packageCandidates.find(
        (item: any) => normalizePaymentNetwork(item.network) === networkCode,
      ) || null;

      // Prefer an explicit package method. If none exists for this network,
      // reuse the admin-enabled USDT withdrawal method already shown as the
      // package fallback in /api/payment-options. This keeps the submit API
      // aligned with the options the card actually displays.
      if (!payment) {
        const paymentCandidates = await PaymentOption.find({
          asset: USDT_ASSET,
          $or: [
            { kind: "withdrawal" },
            { kind: "both" },
            { kind: { $exists: false } },
          ],
        }).lean();
        payment = paymentCandidates.find(
          (item: any) =>
            normalizePaymentNetwork(item.network) === networkCode &&
            item.enabled === true &&
            item.withdrawalEnabled !== false,
        ) || null;
      }
    } else {
      const paymentCandidates = await PaymentOption.find({
        asset: USDT_ASSET,
        $or: [
          { kind: "withdrawal" },
          { kind: "both" },
          { kind: { $exists: false } },
        ],
      }).lean();
      payment = paymentCandidates.find(
        (item: any) => normalizePaymentNetwork(item.network) === networkCode,
      ) || null;
    }

    let minAmount = source === "wallet"
      ? Number(settings.withdrawals.minGeneralWithdrawal ?? settings.withdrawals.minAmount ?? 0)
      : 0;

    let maxAmount = source === "wallet"
      ? Number(settings.withdrawals.maxAmount || 0)
      : 0;

    let fee = 0;
    let networkName = networkCode;

    if (payment) {
      if (!payment.enabled || payment.withdrawalEnabled === false) {
        return NextResponse.json(
          {
            success: false,
            message: "وسيلة السحب متوقفة حاليًا",
          },
          { status: 400 }
        );
      }

      minAmount = Math.max(
        minAmount,
        Number(payment.minWithdrawal || 0)
      );

      const paymentMax = Number((payment as any).maxWithdrawal || 0);
      if (paymentMax > 0) {
        maxAmount = maxAmount > 0 ? Math.min(maxAmount, paymentMax) : paymentMax;
      }
      fee = Number((payment as any).withdrawalFee || 0);
      networkName = normalizePaymentNetwork(payment.network) || networkCode;
    } else {
      /*
       * لو مفيش PaymentOption، ندعم Asset Network
       * الموجودة في النظام.
       */
      const asset = await Asset.findOne({
        symbol: USDT_ASSET,
        enabled: true,
        withdrawalEnabled: true,
      });

      if (!asset) {
        return NextResponse.json(
          {
            success: false,
            message: "العملة غير متاحة للسحب",
          },
          { status: 400 }
        );
      }

      const network = asset.networks.find(
        (item) =>
          normalizePaymentNetwork(item.code) === networkCode &&
          item.enabled &&
          item.withdrawalEnabled
      );

      if (!network) {
        return NextResponse.json(
          {
            success: false,
            message: "الشبكة غير متاحة للسحب",
          },
          { status: 400 }
        );
      }

      minAmount = Math.max(
        minAmount,
        Number(network.minWithdrawal || 0)
      );

      const networkMax = Number(
        network.maxWithdrawal || 0
      );

      if (networkMax > 0) {
        maxAmount =
          maxAmount > 0
            ? Math.min(maxAmount, networkMax)
            : networkMax;
      }

      fee = Number(network.withdrawalFee || 0);
      networkName = normalizePaymentNetwork(network.code) || networkCode;
    }

    if (source === "wallet") {
      minAmount = Math.max(
        minAmount,
        Number(settings.withdrawals.minGeneralWithdrawal ?? settings.withdrawals.minAmount ?? 0)
      );
    }

    // Package requests use the package-specific minimum below, derived from
    // the admin-configured package minimum. Do not reject them here using the
    // general payment/network minimum, which can show a stale lower value.
    if (source !== "package" && amount < minAmount) {
      return NextResponse.json(
        {
          success: false,
          message: `أقل مبلغ يمكن سحبه هو ${minAmount} ${assetCode}. أدخل مبلغًا مساويًا للحد الأدنى أو أكبر.`,
          minAmount,
          maxAmount,
        },
        { status: 400 }
      );
    }

    if (maxAmount > 0 && amount > maxAmount) {
      return NextResponse.json(
        {
          success: false,
          message: `أقصى مبلغ مسموح بسحبه حاليًا هو ${maxAmount} ${assetCode}. خفّض المبلغ ثم حاول مرة أخرى.`,
          minAmount,
          maxAmount,
        },
        { status: 400 }
      );
    }

    const receiveAmount = amount - fee;

    if (receiveAmount <= 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "الرسوم أكبر من المبلغ المطلوب",
        },
        { status: 400 }
      );
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);

    tomorrow.setDate(
      tomorrow.getDate() + 1
    );

    const dailyAggregate =
      await WithdrawalRequest.aggregate([
        {
          $match: {
            userId: user._id,
            createdAt: {
              $gte: today,
              $lt: tomorrow,
            },
            status: {
              $in: [
                "pending",
                "approved",
                "completed",
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: "$amount",
            },
          },
        },
      ]);

    const dailyUsed = Number(
      dailyAggregate[0]?.total || 0
    );

    const dailyLimit = source === "wallet"
      ? Number(settings.withdrawals.dailyLimit || 0)
      : 0;

    if (
      dailyLimit > 0 &&
      dailyUsed + amount > dailyLimit
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "تجاوزت الحد اليومي للسحب",
          dailyLimit,
          dailyUsed,
          remaining: Math.max(
            0,
            dailyLimit - dailyUsed
          ),
        },
        { status: 400 }
      );
    }

    /*
     * قفل الرصيد من المحفظة العامة أو رصيد أرباح الباقة.
     * رصيد الإيداع الخارجي منفصل ولا يسمح بسحبه مباشرة.
     */
    let lockedWalletAllocations: Array<{ walletType: "spot" | "funding"; amount: number }> = [];
    let lockedPackageAllocations: Array<{ userPackageId: mongoose.Types.ObjectId | string; amount: number }> = [];
    let lockedUserPackage: any = null;
    let isFirstPackageWithdrawal = false;

    if (source === "package") {
      if (assetCode !== "USDT" || !mongoose.Types.ObjectId.isValid(userPackageId)) {
        return NextResponse.json(
          { success: false, message: "اختر حساب باقة صحيحًا وبعملة USDT" },
          { status: 400 }
        );
      }

      const currentPackage = await UserPackage.findOne({
        _id: userPackageId,
        userId: user._id,
        asset: assetCode,
        status: { $in: ["active", "cancelled"] },
      }).lean();

      if (!currentPackage) {
        return NextResponse.json(
          { success: false, message: "حساب الباقة غير موجود أو لا يخص هذا المستخدم" },
          { status: 404 }
        );
      }

      const normalizePackageName = (value: unknown) =>
        String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
      const normalizedPackageName = normalizePackageName(currentPackage.packageName);
      const sameNamePackageRows = normalizedPackageName
        ? await UserPackage.find({ userId: user._id })
            .select("_id packageName packageId investedAmount availableEarnings lockedEarnings withdrawalBalanceDebt status withdrawalRequestPending firstWithdrawalStatus activatedAt createdAt")
            .lean()
        : [];
      const packageFamilyRows = sameNamePackageRows.filter(
        (row: any) => normalizePackageName(row.packageName) === normalizedPackageName &&
          String(row.status || "") !== "deleted"
      );
      const sameNamePackageIds = packageFamilyRows.map((row: any) => row._id);
      if (!sameNamePackageIds.some((id: any) => String(id) === String(currentPackage._id))) {
        sameNamePackageIds.push(currentPackage._id);
        packageFamilyRows.push(currentPackage as any);
      }

      const activePackageWithdrawal = await WithdrawalRequest.findOne({
        userId: user._id,
        source: "package",
        userPackageId: { $in: sameNamePackageIds },
        status: { $in: ["pending", "processing"] },
      }).select("_id amount status createdAt").sort({ createdAt: -1 }).lean();

      if (activePackageWithdrawal) {
        const activeStatus = String(activePackageWithdrawal.status || "pending");
        const activeMessage = activeStatus === "pending"
          ? "لديك طلب سحب من باقة " + currentPackage.packageName + " بقيمة " + Number(activePackageWithdrawal.amount || 0) + " " + assetCode + " قيد مراجعة الإدارة. لا يمكنك إنشاء طلب آخر من نفس الباقة قبل اتخاذ قرار."
          : "طلب السحب من باقة " + currentPackage.packageName + " قيد التنفيذ. لا يمكنك إنشاء طلب آخر من نفس الباقة حتى ينتهي الطلب الجاري.";

        return NextResponse.json(
          {
            success: false,
            message: activeMessage,
            activeWithdrawalId: String(activePackageWithdrawal._id),
            activeWithdrawalStatus: activeStatus,
          },
          { status: 409 }
        );
      }

      // The request status is authoritative. Clear legacy flags left behind by
      // older approval/rejection paths only after confirming there is no open
      // withdrawal for this package family.
      await UserPackage.updateMany(
        {
          _id: { $in: sameNamePackageIds },
          userId: user._id,
          withdrawalRequestPending: true,
        },
        { $set: { withdrawalRequestPending: false } },
      );

      // The cash bucket is tracked per activation, while historic overpayments
      // are offset within the same package family. Never permit a withdrawal that
      // exceeds the family's net available balance.
      // A historical debt in any package reduces the user's total cash
      // budget. Still require the selected activation itself to hold the funds.
      const packageGlobalNetAvailable = sameNamePackageRows.reduce(
        (sum: number, row: any) =>
          sum +
          Math.max(0, Number(row.availableEarnings || 0)) -
          Math.max(0, Number(row.withdrawalBalanceDebt || 0)),
        0,
      );
      const packageAvailable = Math.min(
        Math.max(0, Number(currentPackage.availableEarnings || 0)),
        Math.max(0, packageGlobalNetAvailable),
      );
      const packageInvestedAmount = packageFamilyRows.reduce(
        (sum: number, row: any) => sum + Math.max(0, Number(row.investedAmount || 0)),
        0,
      );
      const countedStatuses = ["pending", "approved", "processing", "completed"] as const;
      const packagePlan = await InvestmentPackage.findById(currentPackage.packageId)
        .select("minimumWithdrawal")
        .lean();
      const configuredMinimums = settings.withdrawals.withdrawalMinByPackage as unknown as Record<string, number> | undefined;
      const configuredPackageMinimum = configuredMinimums?.[String(currentPackage.packageId)];
      // Package requests use the package plan minimum and the package-only method.
      // Global-wallet minimums are intentionally excluded from this calculation.
      const packageMinimum = Math.max(
        Number(configuredPackageMinimum ?? packagePlan?.minimumWithdrawal ?? 100),
        Number(minAmount || 0),
      );
      const [firstWithdrawalRows, referralWithdrawalRows, referredUsers] = await Promise.all([
        WithdrawalRequest.find({
          userId: user._id,
          source: "package",
          userPackageId: { $in: sameNamePackageIds },
          isFirstPackageWithdrawal: true,
          status: { $in: countedStatuses },
        }).select("amount status").lean(),
        WithdrawalRequest.find({
          userId: user._id,
          source: "package",
          isFirstPackageWithdrawal: { $ne: true },
          status: { $in: countedStatuses },
        }).select("amount").lean(),
        User.find({ referredBy: user._id }).select("_id").lean(),
      ]);

      const firstPackageWithdrawalPercent = Math.max(
        0,
        Math.min(100, Number(settings.withdrawals.firstPackageWithdrawalPercent ?? 100))
      );
      const firstPackageWithdrawalCap = Math.max(
        0,
        packageInvestedAmount * firstPackageWithdrawalPercent / 100
      );
      const firstPackageWithdrawalUsed = firstWithdrawalRows.reduce(
        (sum: number, row: any) => sum + Number(row.amount || 0),
        0
      );
      const firstPackageWithdrawalRemaining = Math.max(
        0,
        firstPackageWithdrawalCap - firstPackageWithdrawalUsed
      );
      // After the first-stage withdrawal is approved, later requests must use
      // the active-referral allowance. Do not treat an approved/in-flight first
      // withdrawal as permission to split the original package cap into requests.
      const firstStageWithdrawalApproved = firstWithdrawalRows.some(
        (row: any) => ["approved", "processing", "completed"].includes(String(row.status))
      );
      let referralRemainingForRequest = 0;
      const firstPackageWithdrawalPending = firstWithdrawalRows.some(
        (row: any) => String(row.status) === "pending"
      );

      if (firstPackageWithdrawalPending) {
        return NextResponse.json(
          {
            success: false,
            message: "يوجد طلب من سقف السحب الأول قيد المراجعة؛ انتظر حسمه قبل استكمال السحب أو الانتقال لمرحلة الإحالات.",
            firstPackageWithdrawalRemaining,
          },
          { status: 409 }
        );
      }

      // Phase one: cumulative withdrawals are capped by the original package amount.
      // Once used, later withdrawals require capacity from active referrals.
      if (firstPackageWithdrawalRemaining > 0 && !firstStageWithdrawalApproved) {
        const firstStageAvailable = Math.min(packageAvailable, firstPackageWithdrawalRemaining);
        if (amount > firstStageAvailable + 1e-8) {
          return NextResponse.json(
            {
              success: false,
              message: `عفوًا، الرصيد المتاح للسحب من باقة ${currentPackage.packageName} هو ${firstStageAvailable} ${assetCode} فقط.`,
              availableAmount: firstStageAvailable,
              firstPackageWithdrawalCap,
              firstPackageWithdrawalUsed,
              firstPackageWithdrawalRemaining,
            },
            { status: 400 }
          );
        }
        isFirstPackageWithdrawal = true;
      } else {
        // Phase two and later: approved USDT deposits from referred accounts define the cap.
        const referredIds = referredUsers.map((item: any) => item._id);
        const activeReferralDeposits = referredIds.length
          ? await DepositRequest.aggregate([
              { $match: { userId: { $in: referredIds }, status: "approved", asset: "USDT" } },
              { $group: { _id: "$userId", total: { $sum: "$amount" } } },
            ])
          : [];
        const activeReferralDepositTotal = activeReferralDeposits.reduce(
          (sum: number, row: any) => sum + Number(row.total || 0),
          0
        );
        const referralPercent = Math.max(
          0,
          Math.min(100, Number(settings.withdrawals.referralPackageWithdrawalPercent ?? 50))
        );
        const referralCap = activeReferralDepositTotal * referralPercent / 100;
        const referralUsed = referralWithdrawalRows.reduce(
          (sum: number, row: any) => sum + Number(row.amount || 0),
          0
        );
        const referralRemaining = Math.max(0, referralCap - referralUsed);
        referralRemainingForRequest = referralRemaining;

        if (amount > referralRemaining + 1e-8) {
          const noActiveReferrals = activeReferralDeposits.length === 0 || activeReferralDepositTotal <= 1e-8;
          return NextResponse.json(
            {
              success: false,
              message: noActiveReferrals
                ? "الطاقة منخفضة الآن، يُرجى جلب إحالات نشطة."
                : "المتاح للسحب مقابل الإحالات النشطة هو " + referralRemaining + " " + assetCode + " فقط.",
              activeReferralCount: activeReferralDeposits.length,
              activeReferralDepositTotal,
              referralCap,
              referralUsed,
              referralRemaining,
            },
            { status: 400 }
          );
        }
      }

      if (amount > packageAvailable + 1e-8) {
        return NextResponse.json(
          {
            success: false,
            message: `عفوًا، الرصيد المتاح للسحب من باقة ${currentPackage.packageName} هو ${packageAvailable} ${assetCode} فقط.`,
            availableAmount: packageAvailable,
          },
          { status: 400 }
        );
      }

      // The administrator-configured minimum is mandatory for every package
      // request. A small remaining balance/referral allowance must never bypass it.
      if (amount < packageMinimum) {
        return NextResponse.json(
          { success: false, message: "الحد الأدنى للسحب من باقة " + currentPackage.packageName + " هو " + packageMinimum + " " + assetCode, minAmount: packageMinimum },
          { status: 400 }
        );
      }

      // Atomically reserve the requested amount from this account only.
      // The saved allocation points back to the same account for approval/rejection.
      const lockedAccount = await UserPackage.findOneAndUpdate(
        {
          _id: userPackageId,
          userId: user._id,
          asset: assetCode,
          status: { $in: ["active", "cancelled"] },
          availableEarnings: { $gte: amount },
          withdrawalRequestPending: { $ne: true },
        },
        {
          $inc: { availableEarnings: -amount, lockedEarnings: amount },
          $set: {
            withdrawalRequestPending: true,
            ...(isFirstPackageWithdrawal ? { firstWithdrawalStatus: "pending" } : {}),
          },
        },
        { new: true },
      );

      if (!lockedAccount) {
        const latestAccount = await UserPackage.findOne({
          _id: userPackageId,
          userId: user._id,
          asset: assetCode,
          status: { $in: ["active", "cancelled"] },
        }).select("availableEarnings").lean();
        const latestAvailable = Math.max(0, Number(latestAccount?.availableEarnings || 0));
        return NextResponse.json(
          {
            success: false,
            message: `رصيد حساب الباقة المحدد المتاح للسحب هو ${latestAvailable} ${assetCode} فقط.`,
            availableAmount: latestAvailable,
          },
          { status: 409 },
        );
      }

      lockedPackageAllocations = [{ userPackageId: lockedAccount._id, amount }];
      lockedUserPackage = lockedAccount;
    } else {
      // Lock from spot first, then funding; internally earned money in either
      // wallet is withdrawable. The deposit balance is a separate model and is never queried here.
      let remaining = amount;
      for (const walletType of ["spot", "funding"] as const) {
        if (remaining <= 1e-8) break;
        const currentWallet = await Wallet.findOne({
          userId: user._id,
          type: walletType,
          mode: "live",
        }).select("balances").lean();
        const currentBalance = (currentWallet?.balances || []).find(
          (item: any) => normalizeAsset(item.asset) === assetCode
        );
        const available = Number(currentBalance?.available || 0);
        const allocationAmount = Math.min(remaining, available);
        if (allocationAmount <= 1e-8) continue;

        const lockedWallet = await Wallet.findOneAndUpdate(
          {
            userId: user._id,
            type: walletType,
            mode: "live",
            balances: { $elemMatch: { asset: assetCode, available: { $gte: allocationAmount } } },
          },
          { $inc: { "balances.$.available": -allocationAmount, "balances.$.locked": allocationAmount } },
          { new: true }
        );
        if (!lockedWallet) continue;

        lockedWalletAllocations.push({ walletType, amount: allocationAmount });
        remaining = Number(Math.max(0, remaining - allocationAmount).toFixed(8));
      }

      if (remaining > 1e-8) {
        for (const allocation of lockedWalletAllocations) {
          await Wallet.updateOne(
            { userId: user._id, type: allocation.walletType, mode: "live", "balances.asset": assetCode },
            { $inc: { "balances.$.available": allocation.amount, "balances.$.locked": -allocation.amount } }
          );
        }
        lockedWalletAllocations = [];
        const refreshedWallets = await Wallet.find({
          userId: user._id,
          type: { $in: ["spot", "funding"] },
          mode: "live",
        }).select("balances").lean();
        const availableTotal = refreshedWallets.reduce((sum: number, wallet: any) => {
          const balance = (wallet.balances || []).find((item: any) => normalizeAsset(item.asset) === assetCode);
          return sum + Number(balance?.available || 0);
        }, 0);
        return NextResponse.json(
          {
            success: false,
            message: `رصيد السحب العام المتاح هو ${availableTotal} ${assetCode} فقط. أدخل مبلغًا لا يتجاوز الرصيد المتاح. رصيد الإيداع الخارجي غير متاح للسحب العام.`,
            availableAmount: availableTotal,
          },
          { status: 400 }
        );
      }
    }

    let hasWithdrawalLock = false;
    try {
      const claimedWithdrawalLock = await User.findOneAndUpdate(
        { _id: user._id, hasPendingWithdrawal: { $ne: true } },
        { $set: { hasPendingWithdrawal: true } },
        { new: true }
      ).select("_id").lean();

      if (claimedWithdrawalLock) hasWithdrawalLock = true;

      if (!claimedWithdrawalLock) {
        if (source === "package" && lockedUserPackage) {
          await restoreLockedPackageAllocations(
            user._id,
            userPackageId,
            lockedPackageAllocations,
            isFirstPackageWithdrawal,
          );
          lockedPackageAllocations = [];
        } else if (lockedWalletAllocations.length) {
          for (const allocation of lockedWalletAllocations) {
            await Wallet.updateOne(
              { userId: user._id, type: allocation.walletType, mode: "live", "balances.asset": assetCode },
              { $inc: { "balances.$.available": allocation.amount, "balances.$.locked": -allocation.amount } }
            );
          }
        }

        return NextResponse.json(
          {
            success: false,
            message: "لديك طلب سحب قائم قيد المراجعة بالفعل. انتظر قرار الإدارة بالموافقة أو الرفض قبل تقديم طلب جديد.",
          },
          { status: 409 }
        );
      }

      const withdrawal =
        await WithdrawalRequest.create({
          userId: user._id,
          asset: assetCode,
          network: networkCode,
          amount,
          fee,
          receiveAmount,
          address,
          source,
          walletType: lockedWalletAllocations[0]?.walletType || "spot",
          walletAllocations: source === "wallet" ? lockedWalletAllocations : [],
          userPackageId: source === "package" ? userPackageId : null,
          packageAllocations: source === "package" ? lockedPackageAllocations : [],
          isFirstPackageWithdrawal,
          status: "pending",
          adminNote: "",
        });

      if (source === "package" && lockedUserPackage) {
        await PackageLedger.create({
          userId: user._id,
          userPackageId: lockedUserPackage._id,
          type: "withdrawal",
          asset: assetCode,
          amount: 0,
          note: "طلب سحب بقيمة " + amount + " " + assetCode + " من رصيد أرباح الباقة. رقم الطلب: " + String(withdrawal._id),
        }).catch((ledgerError) => {
          console.error("PACKAGE WITHDRAWAL LEDGER:", ledgerError);
        });
      }

      await Notification.create({
        userId: user._id,
        type: "withdrawal",
        title: "تم إنشاء طلب السحب",
        message: "تم إنشاء طلب سحب " + amount + " " + assetCode + " على شبكة " + networkName + ".",
      }).catch((notificationError) => {
        console.error("WITHDRAWAL NOTIFICATION:", notificationError);
      });

      return NextResponse.json(
        {
          success: true,
          message:
            "تم إنشاء طلب السحب وهو قيد المراجعة",
          withdrawal,
        },
        { status: 201 }
      );
    } catch (error) {
      /*
       * لو إنشاء الطلب فشل بعد قفل الرصيد،
       * نرجع الرصيد مرة أخرى.
       */
      if (source === "package" && lockedUserPackage) {
        await restoreLockedPackageAllocations(
          user._id,
          userPackageId,
          lockedPackageAllocations,
          isFirstPackageWithdrawal,
        );
        lockedPackageAllocations = [];
      } else if (lockedWalletAllocations.length) {
        for (const allocation of lockedWalletAllocations) {
          await Wallet.updateOne(
            { userId: user._id, type: allocation.walletType, mode: "live", "balances.asset": assetCode },
            { $inc: { "balances.$.available": allocation.amount, "balances.$.locked": -allocation.amount } }
          );
        }
      }

      if (hasWithdrawalLock) {
        await User.updateOne(
          { _id: user._id },
          { $set: { hasPendingWithdrawal: false } }
        ).catch((unlockError) => console.error("WITHDRAWAL LOCK RELEASE:", unlockError));
      }

      throw error;
    }
  } catch (error) {
    console.error("WITHDRAWALS POST:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر إنشاء طلب السحب",
      },
      { status: 500 }
    );
  }
}