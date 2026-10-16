import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";
import UserPackage from "@/models/UserPackage";
import InvestmentPackage from "@/models/InvestmentPackage";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import { roundWithdrawal, withdrawalAllowance, availableToWithdraw, validateWithdrawal } from "@/lib/package-withdrawal-policy";
async function activeReferralDeposits(userId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) {
 const referrals = await User.find({ referredBy: userId, isActive: true }).select("_id").session(session || null).lean();
 if (!referrals.length) return 0;
 const deposits = await DepositRequest.aggregate([{ $match: { userId: { $in: referrals.map(r => r._id) }, status: "approved", asset: "USDT" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).session(session || null);
 return roundWithdrawal(Number(deposits[0]?.total || 0));
}
export async function GET(request: NextRequest) {
 const user = await getCurrentUser(request);
 if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
 await connectDB();
 const [plans, accounts, requests, referralTotal] = await Promise.all([
  InvestmentPackage.find({}).select("name price withdrawalMinimum enabled").sort({ sortOrder: 1, price: 1 }).lean(),
  UserPackage.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
  WithdrawalRequest.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
  activeReferralDeposits(user._id),
 ]);
 return NextResponse.json({ success: true, general: { available: 0, configured: false }, packages: plans.map(p => ({
  _id: String(p._id), name: p.name, minimum: Number(p.withdrawalMinimum || 100), accounts: accounts.filter(a => String(a.packageId) === String(p._id)).map(a => {
   const used = requests.filter(r => String(r.userPackageId) === String(a._id) && r.status !== "rejected").reduce((s,r) => s + Number(r.amount),0);
   const allowance = withdrawalAllowance(Number(a.investedAmount), Number(a.status === "active" ? referralTotal : 0), used);
   return { _id: String(a._id), status: a.status, balance: roundWithdrawal(Number(a.availableEarnings || 0)), locked: roundWithdrawal(Number(a.lockedEarnings || 0)), allowance, available: availableToWithdraw(Number(a.availableEarnings || 0), allowance) };
  }),
 })), requests: requests.map(r => ({ _id: String(r._id), userPackageId: String(r.userPackageId), amount: r.amount, status: r.status, createdAt: r.createdAt })) });
}
export async function POST(request: NextRequest) {
 const user = await getCurrentUser(request);
 if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
 await connectDB();
 const body = await request.json().catch(() => ({}));
 const id = String(body.userPackageId || "");
 const amount = Number(body.amount);
 if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "الباقة غير صحيحة" }, { status: 400 });
 const session = await mongoose.startSession();
 try {
  let message = "";
  await session.withTransaction(async () => {
   const existing = await WithdrawalRequest.findOne({ userId: user._id, status: "pending" }).session(session);
   if (existing) throw new Error("لديك طلب سحب معلق بالفعل");
   const account = await UserPackage.findOne({ _id: id, userId: user._id }).session(session);
   if (!account) throw new Error("حساب الباقة غير موجود");
   const plan = await InvestmentPackage.findById(account.packageId).session(session);
   if (!plan) throw new Error("الباقة غير موجودة");
   const prior = await WithdrawalRequest.find({ userPackageId: account._id, status: { $in: ["pending","approved"] } }).session(session).lean();
   const used = roundWithdrawal(prior.reduce((s,r) => s + r.amount, 0));
   const referralTotal = account.status === "active" ? await activeReferralDeposits(user._id, session) : 0;
   const allowance = withdrawalAllowance(account.investedAmount, referralTotal, used);
   const minimum = Number(plan.withdrawalMinimum || 100);
   message = validateWithdrawal(amount, minimum, account.availableEarnings, allowance) || "";
   if (message) throw new Error(message);
   const reserved = await UserPackage.updateOne({ _id: account._id, userId: user._id, availableEarnings: { $gte: amount } }, { $inc: { availableEarnings: -amount, lockedEarnings: amount } }, { session });
   if (reserved.modifiedCount !== 1) throw new Error("الرصيد تغير، حاول مجددًا");
   await WithdrawalRequest.create([{ userId: user._id, userPackageId: account._id, packageId: account.packageId, amount, status: "pending" }], { session });
  });
  return NextResponse.json({ success: true, message: "تم إنشاء طلب السحب وحجز المبلغ" }, { status: 201 });
 } catch(e) {
  const msg = e instanceof Error ? e.message : "تعذر إنشاء الطلب";
  return NextResponse.json({ success: false, message: msg.includes("E11000") ? "لديك طلب سحب معلق بالفعل" : msg }, { status: 409 });
 } finally { await session.endSession(); }
}
