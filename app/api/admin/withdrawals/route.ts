import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import UserPackage from "@/models/UserPackage";
import InvestmentPackage from "@/models/InvestmentPackage";
import Wallet from "@/models/Wallet";
import PlatformSettings from "@/models/PlatformSettings";

export async function GET(request: NextRequest) {
  const admin = await requireAdminLeader(request);
  if (!admin) return NextResponse.json({ success: false }, { status: 401 });
  await connectDB();
  const [plans, requests, settings] = await Promise.all([
    InvestmentPackage.find({}).select("name withdrawalMinimum enabled price").sort({ sortOrder: 1, price: 1 }).lean(),
    WithdrawalRequest.find({})
      .populate("userId", "email username")
      .populate("userPackageId", "packageName")
      .populate("packageId", "name")
      .populate("allocations.packageId", "name")
      .populate("allocations.userPackageId", "packageName")
      .sort({ createdAt: -1 }).limit(500).lean(),
    PlatformSettings.findOne({ key: "global" }).select("withdrawals").lean(),
  ]);
  return NextResponse.json({
    success: true,
    plans,
    requests,
    generalMinimum: Number((settings as any)?.withdrawals?.generalMinimum || 0),
  });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminLeader(request);
  if (!admin) return NextResponse.json({ success: false }, { status: 401 });
  await connectDB();
  const body = await request.json().catch(() => ({}));

  if (body.action === "generalMinimum") {
    const minimum = Number(body.minimum);
    if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1000000000 || Math.round(minimum * 1e8) / 1e8 !== minimum) {
      return NextResponse.json({ success: false, message: "الحد الأدنى للسحب العام غير صالح" }, { status: 400 });
    }
    await PlatformSettings.updateOne(
      { key: "global" },
      { $set: { "withdrawals.generalMinimum": minimum } },
      { upsert: true }
    );
    return NextResponse.json({ success: true, generalMinimum: minimum });
  }

  if (body.action === "minimum") {
    const minimum = Number(body.minimum);
    if (!mongoose.isValidObjectId(body.packageId) || !Number.isFinite(minimum) || minimum <= 0 ||
        minimum > 1000000000 || Math.round(minimum * 1e8) / 1e8 !== minimum) {
      return NextResponse.json({ success: false, message: "الحد الأدنى غير صالح" }, { status: 400 });
    }
    const plan = await InvestmentPackage.findByIdAndUpdate(
      body.packageId, { $set: { withdrawalMinimum: minimum } }, { new: true, runValidators: true }
    );
    return NextResponse.json({ success: Boolean(plan), plan }, { status: plan ? 200 : 404 });
  }

  if (!["approve", "reject"].includes(body.action) || !mongoose.isValidObjectId(body.id)) {
    return NextResponse.json({ success: false, message: "الطلب غير صالح" }, { status: 400 });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const row = await WithdrawalRequest.findOneAndUpdate(
        { _id: body.id, status: "pending" },
        { $set: { status: body.action === "approve" ? "approved" : "rejected", reviewedAt: new Date() } },
        { session, new: true }
      );
      if (!row) throw new Error("تمت معالجة الطلب بالفعل");

      const rejecting = body.action === "reject";
      if ((row.type || "package") === "general") {
        if (rejecting) {
          const returned = await Wallet.updateOne(
            { userId: row.userId, type: "spot", mode: "live", balances: { $elemMatch: { asset: row.asset || "USDT" } } },
            { $inc: { "balances.$.available": row.amount } },
            { session }
          );
          if (returned.modifiedCount !== 1) throw new Error("تعذر إرجاع مبلغ السحب العام؛ لم يتم اعتماد المراجعة");
        }
        return;
      }

      const legacyAllocations = row.allocations?.length
        ? row.allocations.map((allocation) => ({ userPackageId: allocation.userPackageId, amount: allocation.amount }))
        : row.userPackageId
          ? [{ userPackageId: row.userPackageId, amount: row.amount }]
          : [];
      if (!legacyAllocations.length) throw new Error("طلب الباقة لا يحتوي على حساب رصيد مرتبط");

      for (const allocation of legacyAllocations) {
        const changes = rejecting
          ? { $inc: { lockedEarnings: -allocation.amount, availableEarnings: allocation.amount } }
          : { $inc: { lockedEarnings: -allocation.amount } };
        const updated = await UserPackage.updateOne(
          { _id: allocation.userPackageId, userId: row.userId, lockedEarnings: { $gte: allocation.amount } },
          changes,
          { session }
        );
        if (updated.modifiedCount !== 1) throw new Error("تعذر مطابقة رصيد الباقة المحجوز؛ لم تتغير المراجعة");
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "فشلت المراجعة",
    }, { status: 409 });
  } finally {
    await session.endSession();
  }
}
