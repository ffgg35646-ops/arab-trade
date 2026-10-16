import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";
import UserPackage from "@/models/UserPackage";
import InvestmentPackage from "@/models/InvestmentPackage";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Wallet from "@/models/Wallet";
import Asset from "@/models/Asset";
import { separateLegacyDepositsFromSpotWallet } from "@/lib/deposit-balance-source";
import {
  roundWithdrawal,
  withdrawalAllowance,
  availableToWithdraw,
  validateWithdrawal,
} from "@/lib/package-withdrawal-policy";

async function activeReferralDeposits(userId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) {
  const referrals = await User.find({ referredBy: userId, isActive: true })
    .select("_id").session(session || null).lean();
  if (!referrals.length) return 0;
  const deposits = await DepositRequest.aggregate([
    { $match: { userId: { $in: referrals.map((referral) => referral._id) }, status: "approved", asset: "USDT" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]).session(session || null);
  return roundWithdrawal(Number(deposits[0]?.total || 0));
}

async function allowedNetwork(network: string, session?: mongoose.ClientSession) {
  const asset = await Asset.findOne({
    symbol: "USDT",
    enabled: true,
    networks: { $elemMatch: { code: network, enabled: true } },
  }).select("_id").session(session || null).lean();
  return Boolean(asset);
}

function getUsdtAvailable(wallet: { balances?: Array<{ asset?: string; available?: number }> } | null) {
  return roundWithdrawal(Number(
    wallet?.balances?.find((balance) => String(balance.asset || "").toUpperCase() === "USDT")?.available || 0
  ));
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  await connectDB();
  await separateLegacyDepositsFromSpotWallet(user._id);

  const [plans, sourceAccounts, requests, referralTotal, wallet, assetConfig, platformSettings] = await Promise.all([
    InvestmentPackage.find({}).select("name price withdrawalMinimum enabled sortOrder").sort({ sortOrder: 1, price: 1 }).lean(),
    UserPackage.find({ userId: user._id }).sort({ createdAt: 1 }).lean(),
    WithdrawalRequest.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    activeReferralDeposits(user._id),
    Wallet.findOne({ userId: user._id, type: "spot", mode: "live" }).select("balances").lean(),
    Asset.findOne({ symbol: "USDT", enabled: true }).select("networks").lean(),
    getPlatformSettings(),
  ]);

  const packages = plans.flatMap((plan) => {
    const rows = sourceAccounts.filter((account) => String(account.packageId) === String(plan._id));
    const balance = roundWithdrawal(rows.reduce((sum, account) => sum + Number(account.availableEarnings || 0), 0));
    const locked = roundWithdrawal(rows.reduce((sum, account) => sum + Number(account.lockedEarnings || 0), 0));
    const hasActiveAccount = rows.some((account) => account.status === "active");
    const pending = requests.some((item) => String(item.packageId || "") === String(plan._id) && item.status === "pending");
    const hasOutstandingFunds = balance > 0 || locked > 0 || pending;
    if (!plan.enabled && !hasOutstandingFunds) return [];

    const used = roundWithdrawal(requests
      .filter((item) => String(item.packageId || "") === String(plan._id) && item.status !== "rejected" && item.type !== "general")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0));
    const activationAmount = rows.reduce((maximum, account) => Math.max(maximum, Number(account.investedAmount || 0)), 0);
    const allowance = rows.length ? withdrawalAllowance(activationAmount, referralTotal, used) : 0;
    const account = rows.length ? {
      _id: String(plan._id),
      sourceAccountIds: rows.map((row) => String(row._id)),
      status: hasActiveAccount ? "active" : "cancelled",
      balance,
      locked,
      allowance,
      available: availableToWithdraw(balance, allowance),
      hasAccount: true,
    } : null;

    return [{
      _id: String(plan._id),
      name: plan.name,
      price: Number(plan.price || 0),
      minimum: Number(plan.withdrawalMinimum || 100),
      enabled: Boolean(plan.enabled),
      account,
    }];
  });

  const networks = (assetConfig?.networks || [])
    .filter((network: any) => network.enabled !== false && String(network.code || "").trim())
    .sort((a: any, b: any) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((network: any) => ({ code: String(network.code).toUpperCase(), name: String(network.name || network.code) }))
    .filter((network: { code: string }, index: number, rows: { code: string }[]) => rows.findIndex((candidate) => candidate.code === network.code) === index);

  return NextResponse.json({
    success: true,
    general: {
      available: getUsdtAvailable(wallet),
      minimum: Number(platformSettings.withdrawals?.generalMinimum || 0),
      configured: Number(platformSettings.withdrawals?.generalMinimum || 0) > 0,
    },
    networks,
    packages,
    requests: requests.map((item) => ({
      _id: String(item._id),
      type: item.type || "package",
      packageId: item.packageId ? String(item.packageId) : null,
      amount: Number(item.amount),
      asset: item.asset || "USDT",
      network: item.network,
      payoutAddress: item.payoutAddress,
      status: item.status,
      createdAt: item.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  await connectDB();
  await separateLegacyDepositsFromSpotWallet(user._id);

  const body = await request.json().catch(() => ({}));
  const type = body.type === "general" ? "general" : "package";
  const packageId = String(body.packageId || "").trim();
  const amount = Number(body.amount);
  const asset = String(body.asset || "").trim().toUpperCase() as "USDT";
  const network = String(body.network || "").trim().toUpperCase();
  const payoutAddress = String(body.payoutAddress || "").trim();

  if (!Number.isFinite(amount) || amount <= 0 || roundWithdrawal(amount) !== amount) {
    return NextResponse.json({ success: false, message: "مبلغ السحب غير صالح" }, { status: 400 });
  }
  if (asset !== "USDT") return NextResponse.json({ success: false, message: "العملة المدعومة حاليًا هي USDT" }, { status: 400 });
  if (!network || !(await allowedNetwork(network))) {
    return NextResponse.json({ success: false, message: "اختر شبكة مفعّلة من إعدادات الأدمن" }, { status: 400 });
  }
  if (payoutAddress.length < 3 || payoutAddress.length > 200) {
    return NextResponse.json({ success: false, message: "عنوان الدفع غير صحيح" }, { status: 400 });
  }
  if (type === "package" && !mongoose.isValidObjectId(packageId)) {
    return NextResponse.json({ success: false, message: "الباقة غير صحيحة" }, { status: 400 });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await WithdrawalRequest.findOne({ userId: user._id, status: "pending" }).session(session);
      if (existing) throw new Error("لديك طلب سحب معلق بالفعل");

      if (type === "general") {
        const settings = await getPlatformSettings();
        const minimum = Number(settings.withdrawals?.generalMinimum || 0);
        if (minimum <= 0) throw new Error("لم يحدد الأدمن الحد الأدنى للسحب العام بعد");
        if (amount < minimum) throw new Error("الحد الأدنى للسحب العام هو " + minimum + " USDT");

        const wallet = await Wallet.findOne({ userId: user._id, type: "spot", mode: "live" }).session(session);
        if (!wallet) throw new Error("لا يوجد رصيد عام متاح للسحب");
        const available = getUsdtAvailable(wallet);
        if (amount > available) throw new Error("المتاح للسحب العام " + available + " USDT فقط");

        const reserved = await Wallet.updateOne(
          { _id: wallet._id, balances: { $elemMatch: { asset: "USDT", available: { $gte: amount } } } },
          { $inc: { "balances.$.available": -amount } },
          { session }
        );
        if (reserved.modifiedCount !== 1) throw new Error("الرصيد العام تغير، حاول مجددًا");

        await WithdrawalRequest.create([{
          userId: user._id, type: "general", amount, asset, network, payoutAddress, status: "pending",
        }], { session });
        return;
      }

      const plan = await InvestmentPackage.findById(packageId).session(session);
      if (!plan) throw new Error("الباقة غير موجودة");
      const accounts = await UserPackage.find({ userId: user._id, packageId: plan._id })
        .sort({ createdAt: 1 }).session(session).lean();
      if (!accounts.length) throw new Error("لم يتم تفعيل هذه الباقة من قبل؛ لا يوجد رصيد سحب لها");

      const totalBalance = roundWithdrawal(accounts.reduce((sum, account) => sum + Number(account.availableEarnings || 0), 0));
      const prior = await WithdrawalRequest.find({
        userId: user._id,
        packageId: plan._id,
        status: { $in: ["pending", "approved"] },
        type: { $ne: "general" },
      }).session(session).lean();
      const used = roundWithdrawal(prior.reduce((sum, item) => sum + Number(item.amount || 0), 0));
      const referralTotal = await activeReferralDeposits(user._id, session);
      const activationAmount = accounts.reduce((maximum, account) => Math.max(maximum, Number(account.investedAmount || 0)), 0);
      const allowance = withdrawalAllowance(activationAmount, referralTotal, used);
      const minimum = Number(plan.withdrawalMinimum || 100);
      const validationMessage = validateWithdrawal(amount, minimum, totalBalance, allowance);
      if (validationMessage) throw new Error(validationMessage);

      let remaining = amount;
      const allocations: Array<{ userPackageId: mongoose.Types.ObjectId; amount: number }> = [];
      for (const account of accounts) {
        if (remaining <= 0) break;
        const available = roundWithdrawal(Number(account.availableEarnings || 0));
        if (available <= 0) continue;
        const part = roundWithdrawal(Math.min(available, remaining));
        const reserved = await UserPackage.updateOne(
          { _id: account._id, userId: user._id, availableEarnings: { $gte: part } },
          { $inc: { availableEarnings: -part, lockedEarnings: part } },
          { session }
        );
        if (reserved.modifiedCount !== 1) throw new Error("رصيد الباقة تغير، حاول مجددًا");
        allocations.push({ userPackageId: account._id, amount: part });
        remaining = roundWithdrawal(remaining - part);
      }
      if (remaining > 0 || !allocations.length) throw new Error("تعذر حجز كامل مبلغ السحب؛ لم يتم إنشاء الطلب");

      await WithdrawalRequest.create([{
        userId: user._id,
        type: "package",
        userPackageId: allocations[0].userPackageId,
        packageId: plan._id,
        allocations,
        amount,
        asset,
        network,
        payoutAddress,
        status: "pending",
      }], { session });
    });

    return NextResponse.json({ success: true, message: "تم إنشاء طلب السحب وحجز المبلغ" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إنشاء الطلب";
    return NextResponse.json({
      success: false,
      message: message.includes("E11000") ? "لديك طلب سحب معلق بالفعل" : message,
    }, { status: 409 });
  } finally {
    await session.endSession();
  }
}
