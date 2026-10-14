import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedIdentity } from "@/lib/require-kyc";
import { connectDB } from "@/lib/mongodb";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Asset from "@/models/Asset";
import PaymentOption from "@/models/PaymentOption";
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

function normalizeAsset(value: unknown) {
  return String(value || "").trim().toUpperCase();
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

    const kycGuard =
      await requireVerifiedIdentity(request);

    if (!kycGuard.ok) {
      return NextResponse.json(
        {
          success: false,
          message: kycGuard.message,
        },
        { status: kycGuard.status }
      );
    }

    await connectDB();
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
    const paymentCandidates = await PaymentOption.find({
      asset: USDT_ASSET,
      $or: [
        { kind: "withdrawal" },
        { kind: "both" },
        { kind: { $exists: false } },
      ],
    }).lean();
    const payment = paymentCandidates.find(
      (item: any) => normalizePaymentNetwork(item.network) === networkCode,
    );

    let minAmount = source === "wallet"
      ? Number(settings.withdrawals.minGeneralWithdrawal ?? settings.withdrawals.minAmount ?? 0)
      : 0;

    let maxAmount = Number(
      settings.withdrawals.maxAmount || 0
    );

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

    if (
      amount < minAmount ||
      (maxAmount > 0 && amount > maxAmount)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            maxAmount > 0
              ? `المبلغ يجب أن يكون بين ${minAmount} و ${maxAmount}`
              : `الحد الأدنى للسحب هو ${minAmount}`,
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

    const dailyLimit = Number(
      settings.withdrawals.dailyLimit || 0
    );

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

      const packagePlan = await InvestmentPackage.findById(currentPackage.packageId)
        .select("minimumWithdrawal")
        .lean();
      const configuredMinimums = settings.withdrawals.withdrawalMinByPackage as unknown as Record<string, number> | undefined;
      const configuredPackageMinimum = configuredMinimums?.[String(currentPackage.packageId)];
      const packageMinimum = Math.max(
        Number(configuredPackageMinimum ?? packagePlan?.minimumWithdrawal ?? settings.withdrawals.minAmount ?? 0),
        Number(minAmount || 0)
      );
      if (amount < packageMinimum) {
        return NextResponse.json(
          { success: false, message: "الحد الأدنى للسحب من باقة " + currentPackage.packageName + " هو " + packageMinimum + " " + assetCode, minAmount: packageMinimum },
          { status: 400 }
        );
      }

      const countedStatuses = ["pending", "approved", "processing", "completed"];
      const [firstWithdrawalRows, referralWithdrawalRows, referredUsers] = await Promise.all([
        WithdrawalRequest.find({
          userId: user._id,
          source: "package",
          userPackageId: currentPackage._id,
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
        Number(currentPackage.investedAmount || 0) * firstPackageWithdrawalPercent / 100
      );
      const firstPackageWithdrawalUsed = firstWithdrawalRows.reduce(
        (sum: number, row: any) => sum + Number(row.amount || 0),
        0
      );
      const firstPackageWithdrawalRemaining = Math.max(
        0,
        firstPackageWithdrawalCap - firstPackageWithdrawalUsed
      );
      const firstPackageWithdrawalPending = firstWithdrawalRows.some(
        (row: any) => ["pending", "approved", "processing"].includes(String(row.status))
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

      // Phase one: cumulative withdrawals are capped by the original package amount
      // multiplied by the admin-configured first-withdrawal percentage.
      if (firstPackageWithdrawalRemaining > 0) {
        if (amount > firstPackageWithdrawalRemaining) {
          return NextResponse.json(
            {
              success: false,
              message: "المتاح من سقف السحب الأول لباقة " + currentPackage.packageName + " هو " + firstPackageWithdrawalRemaining + " " + assetCode + ". بعد استهلاك هذا السقف يصبح السحب مقابل الإحالات النشطة.",
              firstPackageWithdrawalCap,
              firstPackageWithdrawalUsed,
              firstPackageWithdrawalRemaining,
            },
            { status: 400 }
          );
        }
        isFirstPackageWithdrawal = true;
      } else {
        // Phase two and later: the configured percentage of approved USDT deposits
        // made by the user's referred accounts defines the cumulative withdrawal cap.
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

        if (amount > referralRemaining) {
          return NextResponse.json(
            {
              success: false,
              message: "حد السحب المتبقي مقابل إيداعات الإحالات النشطة هو " + referralRemaining + " " + assetCode + ". تحتاج إلى إحالات نشطة وإيداعات معتمدة إضافية لزيادة الحد.",
              activeReferralDepositTotal,
              referralCap,
              referralUsed,
              referralRemaining,
            },
            { status: 400 }
          );
        }
      }

      const packageFilter: Record<string, any> = {
        _id: userPackageId,
        userId: user._id,
        asset: assetCode,
        status: { $in: ["active", "cancelled"] },
        availableEarnings: { $gte: amount },
      };

      if (isFirstPackageWithdrawal) {
        // Allow repeat requests against the remaining first-stage allowance only
        // after the previous first-stage request has been settled.
        packageFilter.firstWithdrawalStatus = { $in: ["available", "completed", null] };
      }

      lockedUserPackage = await UserPackage.findOneAndUpdate(
        packageFilter,
        {
          $inc: { availableEarnings: -amount, lockedEarnings: amount },
          ...(isFirstPackageWithdrawal ? { $set: { firstWithdrawalStatus: "pending" } } : {}),
        },
        { new: true }
      );

      if (!lockedUserPackage) {
        return NextResponse.json(
          { success: false, message: "رصيد السحب المتاح غير كافٍ، أو يوجد طلب أول سحب قيد المراجعة بالفعل." },
          { status: 400 }
        );
      }
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
        return NextResponse.json(
          { success: false, message: "رصيد السحب العام غير كافٍ. يشمل الرصيد المتاح أرباح المنصة والمكافآت والإحالات، ولا يشمل الإيداعات الخارجية المخصصة لتفعيل الباقات." },
          { status: 400 }
        );
      }
    }

    try {
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
        await UserPackage.updateOne(
          { _id: lockedUserPackage._id, userId: user._id },
          {
            $inc: { availableEarnings: amount, lockedEarnings: -amount },
            ...(isFirstPackageWithdrawal ? { $set: { firstWithdrawalStatus: "available" } } : {}),
          }
        );
      } else if (lockedWalletAllocations.length) {
        for (const allocation of lockedWalletAllocations) {
          await Wallet.updateOne(
            { userId: user._id, type: allocation.walletType, mode: "live", "balances.asset": assetCode },
            { $inc: { "balances.$.available": allocation.amount, "balances.$.locked": -allocation.amount } }
          );
        }
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