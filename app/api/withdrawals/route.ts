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
import PackageLedger from "@/models/PackageLedger";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";

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

    const assetCode = String(body.asset || "")
      .trim()
      .toUpperCase();

    const networkCode = String(body.network || "")
      .trim();

    const address = String(body.address || "")
      .trim();

    const amount = Number(body.amount);
    const source = body.source === "package" ? "package" : "wallet";
    const userPackageId = String(body.userPackageId || "").trim();

    if (
      !assetCode ||
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
    const payment = await PaymentOption.findOne({
      asset: assetCode,
      network: networkCode,
    }).lean();

    let minAmount = Number(
      settings.withdrawals.minAmount || 0
    );

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

      /*
       * PaymentOption لا يحتوي حاليًا على maxWithdrawal.
       * لذلك الحد الأعلى يظل من إعدادات السحب العامة.
       */
      networkName = payment.network;
    } else {
      /*
       * لو مفيش PaymentOption، ندعم Asset Network
       * الموجودة في النظام.
       */
      const asset = await Asset.findOne({
        symbol: assetCode,
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
          item.code === networkCode &&
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
      networkName = network.name || network.code;
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

      let firstStatus = currentPackage.firstWithdrawalStatus;
      if (firstStatus !== "pending" && Number(currentPackage.totalWithdrawn || 0) > 0) {
        firstStatus = "completed";
        if (currentPackage.firstWithdrawalStatus !== "completed") {
          await UserPackage.updateOne(
            { _id: currentPackage._id, firstWithdrawalStatus: { $ne: "pending" } },
            { $set: { firstWithdrawalStatus: "completed" } }
          );
        }
      } else if (!firstStatus) {
        firstStatus = "available";
        await UserPackage.updateOne(
          { _id: currentPackage._id, firstWithdrawalStatus: { $exists: false } },
          { $set: { firstWithdrawalStatus: "available" } }
        );
      }

      if (firstStatus === "pending") {
        return NextResponse.json(
          { success: false, message: "أول طلب سحب من هذه الباقة ما زال قيد المراجعة. انتظر حسمه قبل تقديم طلب آخر." },
          { status: 409 }
        );
      }

      // Only the currently active package receives the special first-withdrawal cap.
      // Inactive/cancelled package balances require referral-backed cap like later withdrawals.
      isFirstPackageWithdrawal = currentPackage.status === "active" && firstStatus === "available";

      const firstWithdrawalPercent = Math.max(0, Math.min(100, Number(settings.withdrawals.firstPackageWithdrawalPercent ?? 100)));
      const referralWithdrawalPercent = Math.max(0, Math.min(100, Number(settings.withdrawals.referralPackageWithdrawalPercent ?? 50)));
      const firstWithdrawalCap = Number(currentPackage.investedAmount || 0) * firstWithdrawalPercent / 100;

      if (isFirstPackageWithdrawal && amount > firstWithdrawalCap) {
        return NextResponse.json(
          { success: false, message: "الحد الأقصى لأول سحب من هذه الباقة هو " + firstWithdrawalCap + " " + assetCode + " (النسبة المضبوطة: " + firstWithdrawalPercent + "% من قيمة تفعيل الباقة)." },
          { status: 400 }
        );
      }

      if (!isFirstPackageWithdrawal) {
        const referredUsers = await User.find({ referredBy: user._id }).select("_id").lean();
        const referredIds = referredUsers.map((item: any) => item._id);
        const approvedReferralDeposits = referredIds.length
          ? await DepositRequest.aggregate([
              { $match: { userId: { $in: referredIds }, status: "approved", asset: assetCode } },
              { $group: { _id: "$userId", total: { $sum: "$amount" } } },
            ])
          : [];
        const referralDepositTotal = approvedReferralDeposits.reduce(
          (sum: number, row: any) => sum + Number(row.total || 0), 0
        );
        const referralWithdrawalCap = referralDepositTotal * referralWithdrawalPercent / 100;
        const previousReferralWithdrawals = await WithdrawalRequest.aggregate([
          {
            $match: {
              userId: user._id,
              source: "package",
              userPackageId: currentPackage._id,
              isFirstPackageWithdrawal: { $ne: true },
              status: { $in: ["pending", "approved", "processing", "completed"] },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);
        const alreadyWithdrawnAgainstReferrals = Number(previousReferralWithdrawals[0]?.total || 0);
        const referralRemaining = Math.max(0, referralWithdrawalCap - alreadyWithdrawnAgainstReferrals);
        if (amount > referralRemaining) {
          return NextResponse.json(
            {
              success: false,
              message: referralRemaining > 0
                ? "المتاح للسحب الآن من هذه الباقة حسب الإحالات النشطة هو " + referralRemaining + " " + assetCode + " فقط. نسبة الاستحقاق " + referralWithdrawalPercent + "% من إيداعات الإحالات النشطة المعتمدة، وتم خصم السحوبات السابقة."
                : currentPackage.status === "cancelled"
                  ? "هذه الباقة غير نشطة للسحب الآن. عليك بجلب إحالات نشطة لديها إيداعات خارجية معتمدة."
                  : "لا يوجد حد سحب إضافي متاح من هذه الباقة حاليًا. تحتاج إلى إيداعات خارجية معتمدة جديدة من إحالات نشطة لزيادة الحد.",
              activeReferrals: approvedReferralDeposits.length,
              referralDepositTotal,
              referralWithdrawalPercent,
              referralWithdrawalCap,
              alreadyWithdrawnAgainstReferrals,
              referralRemaining,
            },
            { status: 400 }
          );
        }
      }

      if (isFirstPackageWithdrawal && amount > Number(currentPackage.investedAmount || 0)) {
        return NextResponse.json(
          { success: false, message: "الحد الأقصى لأول سحب من هذه الباقة هو " + firstWithdrawalCap + " " + assetCode + ". السحوبات التالية تعتمد على نسبة إيداعات الإحالات النشطة المضبوطة من الإدارة." },
          { status: 400 }
        );
      }

      const packageFilter: Record<string, any> = {
        _id: userPackageId,
        userId: user._id,
        asset: assetCode,
        status: { $in: ["active", "cancelled"] },
        availableEarnings: { $gte: amount },
      };

      if (isFirstPackageWithdrawal) {
        packageFilter.firstWithdrawalStatus = { $in: ["available", null] };
      } else if (currentPackage.status === "cancelled" && firstStatus === "available") {
        // Keep the unused-first marker for audit, but treat this inactive account as referral-gated.
        packageFilter.firstWithdrawalStatus = { $in: ["available", null] };
      } else {
        packageFilter.firstWithdrawalStatus = "completed";
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