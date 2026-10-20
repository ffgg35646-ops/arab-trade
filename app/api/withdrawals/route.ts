import { NextRequest, NextResponse } from "next/server";
import Order from "@/models/Order";
import { getBinanceSpotPair } from "@/lib/binance-market";

const WITHDRAWAL_NETWORKS = [
  { code: "TRC20", name: "TRON" },
  { code: "BEP20", name: "BNB Smart Chain" },
] as const;
const WITHDRAWAL_FEE_PERCENT = 5;
function withdrawalAmounts(gross: number) {
  const feeAmount = roundWithdrawal(gross * WITHDRAWAL_FEE_PERCENT / 100);
  return { grossAmount: roundWithdrawal(gross), feePercent: WITHDRAWAL_FEE_PERCENT, feeAmount, payoutAmount: roundWithdrawal(gross - feeAmount) };
}
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import UserPackage from "@/models/UserPackage";
import InvestmentPackage from "@/models/InvestmentPackage";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Wallet from "@/models/Wallet";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";
import PlatformSettings from "@/models/PlatformSettings";
import Notification from "@/models/Notification";
import { separateLegacyDepositsFromSpotWallet } from "@/lib/deposit-balance-source";
import { consolidateFundingWalletIntoSpotWallet } from "@/lib/consolidate-funding-wallet";
import {
  roundWithdrawal,
  withdrawalAllowance,
  referralWithdrawalAllowance,
  totalWithdrawalAllowance,
  availableToWithdraw,
  validateWithdrawal,
} from "@/lib/package-withdrawal-policy";

function allowedNetwork(network: string) {
  return WITHDRAWAL_NETWORKS.some((option) => option.code === network);
}

function validPayoutAddress(network: string, address: string) {
  if (network === "TRC20") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  if (network === "BEP20") return /^0x[a-fA-F0-9]{40}$/.test(address);
  return false;
}

function getUsdtAvailable(wallet: { balances?: Array<{ asset?: string; available?: number }> } | null) {
  return roundWithdrawal((wallet?.balances || []).reduce((sum, balance) =>
    sum + (String(balance.asset || "").trim().toUpperCase() === "USDT" ? Number(balance.available || 0) : 0),
  0));
}

function packageRequestAllocations(item: any) {
  if (item.status === "rejected" || item.type === "general") return [];
  const allocations = Array.isArray(item.allocations) ? item.allocations : [];
  const byPackage = new Map<string, number>();
  if (allocations.some((allocation: any) => allocation.packageId)) {
    for (const allocation of allocations) {
      if (!allocation.packageId) continue;
      const id = String(allocation.packageId);
      byPackage.set(id, roundWithdrawal((byPackage.get(id) || 0) + Number(allocation.amount || 0)));
    }
    return Array.from(byPackage, ([packageId, amount]) => ({ packageId, amount }));
  }
  if (!item.packageId) return [];
  const amount = roundWithdrawal(allocations.length
    ? allocations.reduce((sum: number, allocation: any) => sum + Number(allocation.amount || 0), 0)
    : Number(item.amount || 0));
  return amount > 0 ? [{ packageId: String(item.packageId), amount }] : [];
}

function packageWithdrawalUsage(
  requests: any[],
  planId: string,
  activationAmount: number,
  activationCaps: Map<string, number>,
) {
  const byPackage = new Map<string, { packageId: string; amount: number }>();
  for (const item of requests) {
    if (![ "pending", "approved" ].includes(String(item.status || ""))) continue;
    for (const allocation of packageRequestAllocations(item)) {
      if (allocation.amount <= 0) continue;
      const row = byPackage.get(allocation.packageId) || { packageId: allocation.packageId, amount: 0 };
      row.amount = roundWithdrawal(row.amount + allocation.amount);
      byPackage.set(allocation.packageId, row);
    }
  }

  const usedBase = roundWithdrawal(byPackage.get(planId)?.amount || 0);
  // The base activation cap and referral capacity are cumulative, not daily.
  // Referral capacity is shared across all package buckets and only pending/approved
  // requests consume it; rejected requests are returned to available balances.
  const referralUsed = roundWithdrawal(Array.from(byPackage.values()).reduce((sum, row) => {
    const baseCap = Math.max(0, Number(activationCaps.get(row.packageId) || 0));
    return sum + Math.max(0, row.amount - baseCap);
  }, 0));
  return { usedBase, referralUsed, activationAmount };
}

async function activeReferralDepositStats(referrerId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) {
  let referralsQuery = User.find({
    referredBy: referrerId,
    role: "user",
    isActive: true,
    isVerified: true,
  }).select("_id");
  if (session) referralsQuery = referralsQuery.session(session);
  const referrals = await referralsQuery.lean();
  if (!referrals.length) return { activeReferralCount: 0, approvedDepositTotal: 0 };

  let depositsAggregate = DepositRequest.aggregate([
    {
      $match: {
        userId: { $in: referrals.map((item: any) => item._id) },
        asset: "USDT",
        status: "approved",
        creditedAt: { $ne: null },
      },
    },
    { $group: { _id: "$userId", total: { $sum: "$amount" } } },
    { $match: { total: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
  ]);
  if (session) depositsAggregate = depositsAggregate.session(session);
  const grouped = await depositsAggregate;
  return {
    activeReferralCount: Number(grouped[0]?.count || 0),
    approvedDepositTotal: roundWithdrawal(Number(grouped[0]?.total || 0)),
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  await connectDB();
  await separateLegacyDepositsFromSpotWallet(user._id);
  await consolidateFundingWalletIntoSpotWallet(user._id);

  const [plans, sourceAccounts, requests, wallet, platformSettings, referralStats] = await Promise.all([
    InvestmentPackage.find({}).select("name price withdrawalMinimum enabled sortOrder").sort({ sortOrder: 1, price: 1 }).lean(),
    UserPackage.find({ userId: user._id }).sort({ createdAt: 1 }).lean(),
    WithdrawalRequest.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    Wallet.findOne({ userId: user._id, type: "spot", mode: "live" }).select("balances").lean(),
    getPlatformSettings(),
    activeReferralDepositStats(user._id),
  ]);

  const activationCaps = new Map<string, number>();
  for (const row of sourceAccounts) {
    const planId = String(row.packageId);
    if (!activationCaps.has(planId) && Number(row.investedAmount || 0) > 0) {
      activationCaps.set(planId, roundWithdrawal(Number(row.investedAmount || 0)));
    }
  }
  // Show one withdrawal card for every package in the admin catalog, even before
  // the user activates it. API validation still refuses withdrawals without an account.
  const packages = plans.map((plan) => {
    const rows = sourceAccounts.filter((account) => String(account.packageId) === String(plan._id));
    const balance = roundWithdrawal(rows.reduce((sum, account) => sum + Number(account.availableEarnings || 0), 0));
    const locked = roundWithdrawal(rows.reduce((sum, account) => sum + Number(account.lockedEarnings || 0), 0));
    const hasActiveAccount = rows.some((account) => account.status === "active");
    const planId = String(plan._id);
    const firstActivation = rows.find((account) => Number(account.investedAmount || 0) > 0);
    const activationAmount = roundWithdrawal(Number(firstActivation?.investedAmount || 0));
    const usage = packageWithdrawalUsage(requests, planId, activationAmount, activationCaps);
    const baseAllowance = rows.length ? withdrawalAllowance(activationAmount, usage.usedBase) : 0;
    const referralPercent = Math.min(100, Math.max(0, Number(platformSettings.withdrawals?.packageReferralUnlockPercent ?? 50)));
    const referralAllowance = rows.length
      ? referralWithdrawalAllowance(referralStats.approvedDepositTotal, referralPercent, usage.referralUsed)
      : 0;
    const allowance = totalWithdrawalAllowance(baseAllowance, referralAllowance);
    const account = {
      _id: String(plan._id),
      sourceAccountIds: rows.map((row) => String(row._id)),
      status: hasActiveAccount ? "active" : rows.length ? "cancelled" : "not_activated",
      balance,
      locked,
      activationAmount,
      allowance,
      baseAllowance,
      // Kept as a compatibility alias for the existing local QA scripts.
      dailyAllowance: baseAllowance,
      activeReferralCount: referralStats.activeReferralCount,
      referralDepositTotal: referralStats.approvedDepositTotal,
      referralUnlockPercent: referralPercent,
      referralUsed: usage.referralUsed,
      referralAllowance,
      available: rows.length ? availableToWithdraw(balance, allowance) : 0,
      hasAccount: rows.length > 0,
    };

    return {
      _id: String(plan._id),
      name: plan.name,
      price: Number(plan.price || 0),
      minimum: Number(plan.withdrawalMinimum || 100),
      enabled: Boolean(plan.enabled),
      account,
    };
  });
  const generalLocked = roundWithdrawal(requests
    .filter((item: any) => (item.type || "package") === "general" && item.status === "pending")
    .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0));
  const packageAvailable = roundWithdrawal(packages.reduce((sum, plan) => sum + Number(plan.account?.balance || 0), 0));
  const packageLocked = roundWithdrawal(packages.reduce((sum, plan) => sum + Number(plan.account?.locked || 0), 0));
  const generalAvailable = getUsdtAvailable(wallet);
  const totalBalance = roundWithdrawal(generalAvailable + generalLocked + packageAvailable + packageLocked);

  return NextResponse.json({
    success: true,
    summary: {
      totalBalance,
      generalAvailable,
      generalLocked,
      packageAvailable,
      packageLocked,
    },
    general: {
      available: generalAvailable,
      minimum: Number(platformSettings.withdrawals?.generalMinimum || 0),
      configured: Number(platformSettings.withdrawals?.generalMinimum || 0) > 0,
      feePercent: WITHDRAWAL_FEE_PERCENT,
    },
    networks: WITHDRAWAL_NETWORKS,
    packages,
    requests: requests.map((item) => ({
      _id: String(item._id),
      type: item.type || "package",
      packageId: item.packageId ? String(item.packageId) : null,
      amount: Number(item.amount),
      grossAmount: Number(item.grossAmount ?? item.amount),
      feePercent: Number(item.feePercent ?? 0),
      feeAmount: Number(item.feeAmount ?? 0),
      payoutAmount: Number(item.payoutAmount ?? item.amount),
      conversionAsset: item.conversionAsset || null,
      conversionOrderId: item.conversionOrderId ? String(item.conversionOrderId) : null,
      conversionQuantity: item.conversionQuantity == null ? null : Number(item.conversionQuantity),
      conversionPrice: item.conversionPrice == null ? null : Number(item.conversionPrice),
      tradingFeeAmount: Number(item.tradingFeeAmount ?? 0),
      asset: item.asset || "USDT",
      network: item.network,
      payoutAddress: item.payoutAddress,
      status: item.status,
      createdAt: item.createdAt,
      reviewedAt: item.reviewedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  await connectDB();
  await separateLegacyDepositsFromSpotWallet(user._id);
  await consolidateFundingWalletIntoSpotWallet(user._id);

  const body = await request.json().catch(() => ({}));
  const type = body.type === "general" ? "general" : "package";
  const packageId = String(body.packageId || "").trim();
  let amount = Number(body.amount);
  const asset = String(body.asset || "").trim().toUpperCase() as "USDT";
  const network = String(body.network || "").trim().toUpperCase();
  const payoutAddress = String(body.payoutAddress || "").trim();
  const conversionOrderId = String(body.conversionOrderId || "").trim();
  let conversionDetails: Record<string, unknown> = {};

  if (conversionOrderId) {
    if (type !== "general" || !mongoose.isValidObjectId(conversionOrderId)) {
      return NextResponse.json({ success: false, message: "مرجع تحويل العملة غير صالح" }, { status: 400 });
    }
    const conversionOrder: any = await Order.findOne({
      _id: conversionOrderId,
      userId: user._id,
      mode: "live",
      executionProvider: "binance",
      purpose: "withdrawal-conversion",
      withdrawalConversionStatus: "pending",
      side: "sell",
    }).lean();
    if (!conversionOrder) {
      return NextResponse.json({ success: false, message: "لم نعثر على أمر بيع مؤكد تابع لحسابك؛ لم يتم إنشاء طلب السحب." }, { status: 409 });
    }
    if (!["filled", "cancelled"].includes(String(conversionOrder.status || "").toLowerCase()) || !conversionOrder.locksReleased) {
      return NextResponse.json({ success: false, message: "أمر البيع لم يصل إلى حالة نهائية مؤكدة؛ لا يمكن سحب حصيلته بعد." }, { status: 409 });
    }
    let pair;
    try {
      pair = await getBinanceSpotPair(String(conversionOrder.symbol || ""));
    } catch {
      return NextResponse.json({ success: false, message: "تعذر التحقق من زوج Binance لهذا البيع؛ لم يتم إنشاء طلب السحب." }, { status: 502 });
    }
    if (!pair || String(pair.quoteAsset).toUpperCase() !== "USDT") {
      return NextResponse.json({ success: false, message: "أمر البيع لا يطابق زوجًا موثقًا مقابل USDT." }, { status: 409 });
    }
    const conversionQuantity = roundWithdrawal(Number(conversionOrder.settledExecutedQuantity || 0));
    const grossQuote = roundWithdrawal(Number(conversionOrder.settledQuoteQuantity || 0));
    const tradingFeeAmount = roundWithdrawal(Number(conversionOrder.settledFeeAmount || 0));
    const proceeds = roundWithdrawal(Math.max(0, grossQuote - tradingFeeAmount));
    if (conversionQuantity <= 0 || grossQuote <= 0 || proceeds <= 0) {
      return NextResponse.json({ success: false, message: "أمر البيع لا يحتوي على حصيلة مؤكدة قابلة للسحب." }, { status: 409 });
    }
    amount = proceeds;
    conversionDetails = {
      conversionAsset: String(pair.baseAsset).toUpperCase(),
      conversionOrderId: conversionOrder._id,
      conversionQuantity,
      conversionPrice: roundWithdrawal(grossQuote / conversionQuantity),
      tradingFeeAmount,
    };
  }

  const feeDetails = Number.isFinite(amount) && amount > 0 ? withdrawalAmounts(amount) : null;

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
  if (!validPayoutAddress(network, payoutAddress)) {
    return NextResponse.json(
      {
        success: false,
        message: network === "TRC20"
          ? "عنوان السحب لا يطابق صيغة TRC20: يجب أن يكون عنوان TRON بطول 34 حرفًا يبدأ بـ T."
          : "عنوان السحب لا يطابق صيغة BEP20: يجب أن يبدأ بـ 0x ويتبعه 40 رقمًا سداسيًا.",
      },
      { status: 400 }
    );
  }
  if (type === "package" && !mongoose.isValidObjectId(packageId)) {
    return NextResponse.json({ success: false, message: "الباقة غير صحيحة" }, { status: 400 });
  }

  const session = await mongoose.startSession();
  let createdWithdrawal: any = null;
  let withdrawalPackageName = "";
  try {
    await session.withTransaction(async () => {
      const existing = await WithdrawalRequest.findOne({ userId: user._id, status: "pending" }).session(session);
      if (existing) throw new Error("لديك طلب سحب معلق بالفعل");
      if (conversionOrderId) {
        const alreadyUsed = await WithdrawalRequest.findOne({ conversionOrderId }).session(session).lean();
        if (alreadyUsed) throw new Error("تم استخدام حصيلة أمر البيع هذا في طلب سحب سابق");
      }

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

        const created = await WithdrawalRequest.create([{
          userId: user._id, type: "general", amount, ...feeDetails!, ...conversionDetails, asset, network, payoutAddress, status: "pending",
        }], { session });
        createdWithdrawal = created[0];
        if (conversionOrderId) {
          const marked = await Order.updateOne(
            {
              _id: conversionOrderId,
              userId: user._id,
              executionProvider: "binance",
              purpose: "withdrawal-conversion",
              withdrawalConversionStatus: "pending",
            },
            { $set: { withdrawalConversionStatus: "withdrawal_created" } },
            { session },
          );
          if (marked.modifiedCount !== 1) throw new Error("تمت معالجة أمر التحويل بالفعل؛ لم يتم إنشاء طلب سحب مكرر");
        }
        return;
      }

      const plan = await InvestmentPackage.findById(packageId).session(session);
      if (!plan) throw new Error("الباقة غير موجودة");
      withdrawalPackageName = String(plan.name || "");
      const allUserAccounts = await UserPackage.find({ userId: user._id })
        .sort({ createdAt: 1 }).session(session).lean();
      const activationCaps = new Map<string, number>();
      for (const row of allUserAccounts) {
        const id = String(row.packageId);
        if (!activationCaps.has(id) && Number(row.investedAmount || 0) > 0) {
          activationCaps.set(id, roundWithdrawal(Number(row.investedAmount || 0)));
        }
      }
      const accounts = allUserAccounts.filter((row) => String(row.packageId) === String(plan._id));
      if (!accounts.length) throw new Error("لم يتم تفعيل هذه الباقة من قبل؛ لا يوجد رصيد سحب لها");

      const totalBalance = roundWithdrawal(accounts.reduce((sum, account) => sum + Number(account.availableEarnings || 0), 0));
      const prior = await WithdrawalRequest.find({
        userId: user._id,
        status: { $in: ["pending", "approved"] },
        type: { $ne: "general" },
      }).session(session).lean();
      // The activation amount is a one-time base allowance for this package bucket.
      // Extra capacity comes from credited deposits by active referrals, minus cumulative
      // package withdrawals already consumed beyond each package's base allowance.
      const firstActivation = accounts.find((account) => Number(account.investedAmount || 0) > 0);
      const activationAmount = roundWithdrawal(Number(firstActivation?.investedAmount || 0));
      const usage = packageWithdrawalUsage(prior, String(plan._id), activationAmount, activationCaps);
      const baseAllowance = withdrawalAllowance(activationAmount, usage.usedBase);
      const referralStats = await activeReferralDepositStats(user._id, session);
      const settings = await PlatformSettings.findOne({ key: "global" }).session(session).lean();
      const referralPercent = Math.min(100, Math.max(0, Number(settings?.withdrawals?.packageReferralUnlockPercent ?? 50)));
      const referralAllowance = referralWithdrawalAllowance(
        referralStats.approvedDepositTotal,
        referralPercent,
        usage.referralUsed,
      );
      const allowance = totalWithdrawalAllowance(baseAllowance, referralAllowance);
      const minimum = Number(plan.withdrawalMinimum || 100);
      const referralRequired = baseAllowance <= 0 && referralAllowance <= 0;
      const validationMessage = validateWithdrawal(amount, minimum, totalBalance, allowance, referralRequired);
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

      const created = await WithdrawalRequest.create([{
        userId: user._id,
        type: "package",
        userPackageId: allocations[0].userPackageId,
        packageId: plan._id,
        allocations,
        amount,
        ...feeDetails!,
        asset,
        network,
        payoutAddress,
        status: "pending",
      }], { session });
      createdWithdrawal = created[0];
    });

    if (createdWithdrawal) {
      try {
        const sourceLabel = type === "general" ? "السحب العام" : "باقة " + (withdrawalPackageName || "الباقة");
        await Notification.create({
          userId: user._id,
          type: "withdrawal",
          title: "تم استلام طلب السحب",
          message: "تم استلام طلب سحب إجمالي " + Number(createdWithdrawal.grossAmount ?? amount) + " USDT من " + sourceLabel + ". عمولة السحب " + Number(createdWithdrawal.feeAmount || 0) + " USDT، وصافي المبلغ المطلوب إرساله " + Number(createdWithdrawal.payoutAmount ?? amount) + " USDT. تم حجز الرصيد لحين مراجعة الأدمن.",
          read: false,
        });
      } catch (notificationError) {
        console.error("WITHDRAWAL REQUEST NOTIFICATION:", notificationError);
      }
    }
    return NextResponse.json({
      success: true,
      message: "تم إنشاء طلب السحب. العمولة " + feeDetails!.feeAmount + " USDT، وصافي المبلغ " + feeDetails!.payoutAmount + " USDT بعد خصم 5%.",
      withdrawal: createdWithdrawal ? {
        _id: String(createdWithdrawal._id),
        grossAmount: Number(createdWithdrawal.grossAmount ?? amount),
        feePercent: Number(createdWithdrawal.feePercent ?? WITHDRAWAL_FEE_PERCENT),
        feeAmount: Number(createdWithdrawal.feeAmount ?? feeDetails!.feeAmount),
        payoutAmount: Number(createdWithdrawal.payoutAmount ?? feeDetails!.payoutAmount),
      } : null,
    }, { status: 201 });
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
