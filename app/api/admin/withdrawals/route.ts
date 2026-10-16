import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import UserPackage from "@/models/UserPackage";
import InvestmentPackage from "@/models/InvestmentPackage";
export async function GET(request: NextRequest) {
 const admin = await requireAdminLeader(request);
 if (!admin) return NextResponse.json({ success: false }, { status: 401 });
 await connectDB();
 const [plans, requests] = await Promise.all([InvestmentPackage.find({}).select("name withdrawalMinimum").lean(), WithdrawalRequest.find({}).populate("userId","email username").populate("userPackageId","packageName").sort({ createdAt: -1 }).limit(500).lean()]);
 return NextResponse.json({ success: true, plans, requests });
}
export async function PATCH(request: NextRequest) {
 const admin = await requireAdminLeader(request);
 if (!admin) return NextResponse.json({ success: false }, { status: 401 });
 await connectDB();
 const body = await request.json().catch(() => ({}));
 if (body.action === "minimum") {
  const n = Number(body.minimum);
  if (!mongoose.isValidObjectId(body.packageId) || !Number.isFinite(n) || n <= 0 || Math.round(n*1e8)/1e8 !== n) return NextResponse.json({ success:false, message:"الحد الأدنى غير صالح" }, { status:400 });
  const plan = await InvestmentPackage.findByIdAndUpdate(body.packageId,{ $set: { withdrawalMinimum: n } },{ new:true, runValidators:true });
  return NextResponse.json({ success: !!plan, plan }, { status: plan ? 200 : 404 });
 }
 if (!["approve","reject"].includes(body.action) || !mongoose.isValidObjectId(body.id)) return NextResponse.json({ success:false, message:"الطلب غير صالح" }, { status:400 });
 const session = await mongoose.startSession();
 try {
  await session.withTransaction(async () => {
   const r = await WithdrawalRequest.findOneAndUpdate({ _id: body.id, status: "pending" },{ $set: { status: body.action === "approve" ? "approved" : "rejected", reviewedAt: new Date() } },{ session, new: true });
   if (!r) throw new Error("تمت معالجة الطلب بالفعل");
   const change = body.action === "approve" ? { $inc: { lockedEarnings: -r.amount } } : { $inc: { lockedEarnings: -r.amount, availableEarnings: r.amount } };
   const updated = await UserPackage.updateOne({ _id: r.userPackageId, userId: r.userId, lockedEarnings: { $gte: r.amount } },change,{ session });
   if (updated.modifiedCount !== 1) throw new Error("تعذر مطابقة الرصيد المحجوز؛ لم يتغير الطلب");
  });
  return NextResponse.json({ success:true });
 } catch(e) { return NextResponse.json({ success:false,message:e instanceof Error ? e.message : "فشلت المراجعة" },{status:409}); }
 finally { await session.endSession(); }
}
