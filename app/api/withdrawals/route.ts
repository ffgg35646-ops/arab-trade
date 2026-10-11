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
    let lockedWallet = false;
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
      if (!firstStatus) {
        firstStatus = Number(currentPackage.totalWithdrawn || 0) > 0 ? "completed" : "available";
        await UserPackage.updateOne(
          { _id: currentPackage._id, firstWithdrawalStatus: { $exists: false } },
          { $set: { firstWithdrawalStatus: firstStatus } }
        );
      }

      if (firstStatus === "pending") {
        return NextResponse.json(
          { success: false, message: "أول طلب سحب من هذه الباقة ما زال قيد المراجعة. انتظر حسمه قبل تقديم طلب آخر." },
          { status: 409 }
        );
      }

      isFirstPackageWithdrawal = firstStatus === "available";
      if (isFirstPackageWithdrawal && amount > Number(currentPackage.investedAmount || 0)) {
        return NextResponse.json(
          { success: false, message: "الحد الأقصى لأول سحب من هذه الباقة هو مبلغ تفعيلها: " + Number(currentPackage.investedAmount || 0) + " " + assetCode + ". بعد حسم أول طلب، يمكنك سحب الرصيد المحقق المتاح دون شرط إحالات." },
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
      const wallet = await Wallet.findOneAndUpdate(
        {
          userId: user._id,
          type: "spot",
          mode: "live",
          balances: { $elemMatch: { asset: assetCode, available: { $gte: amount } } },
        },
        { $inc: { "balances.$.available": -amount, "balances.$.locked": amount } },
        { new: true }
      );

      if (!wallet) {
        return NextResponse.json(
          { success: false, message: "الرصيد المتاح غير كافٍ" },
          { status: 400 }
        );
      }
      lockedWallet = true;
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
      } else if (lockedWallet) {
        await Wallet.updateOne(
          { userId: user._id, type: "spot", mode: "live", "balances.asset": assetCode },
          { $inc: { "balances.$.available": amount, "balances.$.locked": -amount } }
        );
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