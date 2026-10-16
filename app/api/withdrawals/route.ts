import { NextRequest, NextResponse } from "next/server";

const WITHDRAWAL_NETWORKS = [
  { code: "TRC20", name: "TRON" },
  { code: "BEP20", name: "BNB Smart Chain" },
] as const;
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import UserPackage from "@/models/UserPackage";
import InvestmentPackage from "@/models/InvestmentPackage";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Wallet from "@/models/Wallet";
import { separateLegacyDepositsFromSpotWallet } from "@/lib/deposit-balance-source";
import {
  roundWithdrawal,
  withdrawalAllowance,
  availableToWithdraw,
  validateWithdrawal,
} from "@/lib/package-withdrawal-policy";

function allowedNetwork(network: string) {
  return WITHDRAWAL_NETWORKS.some((option) => option.code === network);
}

function getUsdtAvailable(wallet: { balances?: Array<{ asset?: string; available?: number }> } | null) {
  return roundWithdrawal(Number(
    wallet?.balances?.find((balance) => String(balance.asset || "").toUpperCase() === "USDT")?.available || 0
  ));
}

function currentWithdrawalDayStart() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  await connectDB();
  await separateLegacyDepositsFromSpotWallet(user._id);

  const [plans, sourceAccounts, requests, wallet, platformSettings] = await Promise.all([
    InvestmentPackage.find({}).select("name price withdrawalMinimum enabled sortOrder").sort({ sortOrder: 1, price: 1 }).lean(),
    UserPackage.find({ userId: user._id }).sort({ createdAt: 1 }).lean(),
    WithdrawalRequest.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    Wallet.findOne({ userId: user._id, type: "spot", mode: "live" }).select("balances").lean(),
    getPlatformSettings(),
  ]);

  const withdrawalDayStart = currentWithdrawalDayStart();
  const packages = plans.flatMap((plan) => {
    const rows = sourceAccounts.filter((account) => String(account.packageId) === String(plan._id));
    const balance = roundWithdrawal(rows.reduce((sum, account) => sum + Number(account.availableEarnings || 0), 0));
    const locked = roundWithdrawal(rows.reduce((sum, account) => sum + Number(account.lockedEarnings || 0), 0));
    const hasActiveAccount = rows.some((account) => account.status === "active");
    const planId = String(plan._id);
    const pending = requests.some((item: any) => item.status === "pending" && (
      String(item.packageId || "") === planId ||
      (Array.isArray(item.allocations) && item.allocations.some((allocation: any) => String(allocation.packageId || "") === planId))
    ));
    const hasOutstandingFunds = balance > 0 || locked > 0 || pending;
    // Hide unused catalog entries and historical activations that have no balance.
    // Keep the plan visible if it is active or still owns funds / a pending withdrawal.
    if (!hasActiveAccount && !hasOutstandingFunds) return [];

    const used = roundWithdrawal(requests.reduce((sum: number, item: any) => {
      if (item.status === "rejected" || item.type === "general") return sum;
      const createdAt = item.createdAt ? new Date(item.createdAt).getTime() : Number.NaN;
      if (!Number.isFinite(createdAt) || createdAt < withdrawalDayStart.getTime()) return sum;
      const allocations = Array.isArray(item.allocations) ? item.allocations : [];
      const allocationHasPlanId = allocations.some((allocation: any) => allocation.packageId);
      if (allocationHasPlanId) {
        return sum + allocations
          .filter((allocation: any) => String(allocation.packageId || "") === planId)
          .reduce((inner: number, allocation: any) => inner + Number(allocation.amount || 0), 0);
      }
      if (String(item.packageId || "") !== planId) return sum;
      return sum + (allocations.length
        ? allocations.reduce((inner: number, allocation: any) => inner + Number(allocation.amount || 0), 0)
        : Number(item.amount || 0));
    }, 0));
    // Rows are sorted oldest-first: the first activation sets this package's initial withdrawal cap.
    const firstActivation = rows.find((account) => Number(account.investedAmount || 0) > 0);
    const activationAmount = roundWithdrawal(Number(firstActivation?.investedAmount || 0));
    const allowance = rows.length ? withdrawalAllowance(activationAmount, used) : 0;
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


  return NextResponse.json({
    success: true,
    general: {
      available: getUsdtAvailable(wallet),
      minimum: Number(platformSettings.withdrawals?.generalMinimum || 0),
      configured: Number(platformSettings.withdrawals?.generalMinimum || 0) > 0,
    },
    networks: WITHDRAWAL_NETWORKS,
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
  if (!network || !allowedNetwork(network)) {
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
        status: { $in: ["pending", "approved"] },
        type: { $ne: "general" },
        createdAt: { $gte: currentWithdrawalDayStart() },
        $or: [
          { packageId: plan._id },
          { allocations: { $elemMatch: { packageId: plan._id } } },
        ],
      }).session(session).lean();
      const used = roundWithdrawal(prior.reduce((sum, item: any) => {
        const allocations = Array.isArray(item.allocations) ? item.allocations : [];
        if (allocations.some((allocation: any) => allocation.packageId)) {
          return sum + allocations
            .filter((allocation: any) => String(allocation.packageId || "") === String(plan._id))
            .reduce((inner: number, allocation: any) => inner + Number(allocation.amount || 0), 0);
        }
        if (String(item.packageId || "") !== String(plan._id)) return sum;
        return sum + (allocations.length
          ? allocations.reduce((inner: number, allocation: any) => inner + Number(allocation.amount || 0), 0)
          : Number(item.amount || 0));
      }, 0));
      // Accounts are sorted oldest-first: the first activation sets this package's initial withdrawal cap.
      const firstActivation = accounts.find((account) => Number(account.investedAmount || 0) > 0);
      const activationAmount = roundWithdrawal(Number(firstActivation?.investedAmount || 0));
      const allowance = withdrawalAllowance(activationAmount, used);
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
