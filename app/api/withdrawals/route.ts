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

type PackageWithdrawalBucket = {
  plan: any;
  rows: any[];
  balance: number;
  locked: number;
  minimum: number;
  allowance: number;
  available: number;
};

function buildPackageWithdrawalBuckets(
  plans: any[],
  sourceAccounts: any[],
  requests: any[],
  referralTotal: number,
): PackageWithdrawalBucket[] {
  // Keep orphaned historical balances withdrawable even if their catalog entry was removed.
  const allPlans = [...plans];
  const knownPlanIds = new Set(allPlans.map((plan) => String(plan._id)));
  for (const account of sourceAccounts) {
    const planId = String(account.packageId || "");
    if (!planId || knownPlanIds.has(planId)) continue;
    knownPlanIds.add(planId);
    allPlans.push({
      _id: account.packageId,
      name: account.packageName || "باقة سابقة",
      price: Number(account.investedAmount || 0),
      withdrawalMinimum: 100,
      enabled: false,
      sortOrder: Number.MAX_SAFE_INTEGER,
    });
  }

  return allPlans.map((plan) => {
    const planId = String(plan._id);
    const rows = sourceAccounts
      .filter((account) => String(account.packageId) === planId)
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    const balance = roundWithdrawal(rows.reduce((sum, account) => sum + Number(account.availableEarnings || 0), 0));
    const locked = roundWithdrawal(rows.reduce((sum, account) => sum + Number(account.lockedEarnings || 0), 0));
    const minimum = Math.max(0.00000001, Number(plan.withdrawalMinimum || 100));

    const used = requests.reduce((sum, item) => {
      if (item.status === "rejected" || item.type === "general") return sum;
      const allocations = Array.isArray(item.allocations) ? item.allocations : [];
      if (allocations.length) {
        const hasAllocationPlanIds = allocations.some((allocation: any) => allocation.packageId);
        if (hasAllocationPlanIds) {
          return sum + allocations
            .filter((allocation: any) => String(allocation.packageId || "") === planId)
            .reduce((allocationSum: number, allocation: any) => allocationSum + Number(allocation.amount || 0), 0);
        }
        if (String(item.packageId || "") === planId) {
          return sum + allocations.reduce((allocationSum: number, allocation: any) => allocationSum + Number(allocation.amount || 0), 0);
        }
        return sum;
      }
      return String(item.packageId || "") === planId
        ? sum + Number(item.amount || 0)
        : sum;
    }, 0);

    const activationAmount = rows.reduce(
      (maximum, account) => Math.max(maximum, Number(account.investedAmount || 0)),
      0,
    );
    const allowance = rows.length ? withdrawalAllowance(activationAmount, referralTotal, used) : 0;
    // Preserve each package's own minimum and allowance, but do not expose per-activation cards.
    const available = balance >= minimum ? availableToWithdraw(balance, allowance) : 0;

    return { plan, rows, balance, locked, minimum, allowance, available };
  });
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

  const packageBuckets = buildPackageWithdrawalBuckets(
    plans as any[],
    sourceAccounts as any[],
    requests as any[],
    referralTotal,
  );

  // Render one card per catalog package, never one card per historical activation.
  // A cancelled activation's balance stays grouped under that package's single card.
  const packages = packageBuckets.flatMap((bucket) => {
    const planId = String(bucket.plan._id);
    const hasActiveAccount = bucket.rows.some((account) => account.status === "active");
    const pending = (requests as any[]).some((item) =>
      item.status === "pending" && (
        String(item.packageId || "") === planId ||
        (Array.isArray(item.allocations) && item.allocations.some((allocation: any) => String(allocation.packageId || "") === planId))
      )
    );
    const hasOutstandingFunds = bucket.balance > 0 || bucket.locked > 0 || pending;

    // Hide unused packages and cancelled history with no remaining funds.
    if (!hasActiveAccount && !hasOutstandingFunds) return [];

    const account = bucket.rows.length ? {
      _id: planId,
      sourceAccountIds: bucket.rows.map((row) => String(row._id)),
      status: hasActiveAccount ? "active" : "cancelled",
      balance: bucket.balance,
      locked: bucket.locked,
      allowance: bucket.allowance,
      available: bucket.available,
      hasAccount: true,
    } : null;

    return [{
      _id: planId,
      name: String(bucket.plan.name || "باقة"),
      price: Number(bucket.plan.price || 0),
      minimum: bucket.minimum,
      enabled: Boolean(bucket.plan.enabled),
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
    return NextResponse.json({ success: false, message: "اختر الباقة التي تريد السحب منها" }, { status: 400 });
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
        status: { $in: ["pending", "approved"] },
        type: { $ne: "general" },
      }).session(session).lean();
      const used = roundWithdrawal(prior.reduce((sum, item: any) => {
        const allocations = Array.isArray(item.allocations) ? item.allocations : [];
        const hasSourcePackageIds = allocations.some((allocation: any) => allocation.packageId);
        if (hasSourcePackageIds) {
          return sum + allocations
            .filter((allocation: any) => String(allocation.packageId || "") === String(plan._id))
            .reduce((allocationSum: number, allocation: any) => allocationSum + Number(allocation.amount || 0), 0);
        }
        if (String(item.packageId || "") !== String(plan._id)) return sum;
        return sum + (allocations.length
          ? allocations.reduce((allocationSum: number, allocation: any) => allocationSum + Number(allocation.amount || 0), 0)
          : Number(item.amount || 0));
      }, 0));
      const referralTotal = await activeReferralDeposits(user._id, session);
      const activationAmount = accounts.reduce((maximum, account) => Math.max(maximum, Number(account.investedAmount || 0)), 0);
      const allowance = withdrawalAllowance(activationAmount, referralTotal, used);
      const minimum = Number(plan.withdrawalMinimum || 100);
      const validationMessage = validateWithdrawal(amount, minimum, totalBalance, allowance);
      if (validationMessage) throw new Error(validationMessage);

      let remaining = amount;
      const allocations: Array<{ userPackageId: mongoose.Types.ObjectId; packageId: mongoose.Types.ObjectId; amount: number }> = [];
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
        allocations.push({ userPackageId: account._id, packageId: plan._id, amount: part });
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
