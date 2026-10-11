import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import UserPackage from "@/models/UserPackage";
import PackageLedger from "@/models/PackageLedger";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    await connectDB();
    const body = await request.json();
    const userPackageId = String(body.userPackageId || "").trim();
    const amount = Number(body.amount);
    const note = String(body.note || "").trim();

    if (!mongoose.Types.ObjectId.isValid(userPackageId) ||
        !Number.isFinite(amount) || amount <= 0 || amount > 1000000000) {
      return NextResponse.json({ success: false, message: "معرف الباقة أو المبلغ غير صالح" }, { status: 400 });
    }
    if (!note || note.length < 5) {
      return NextResponse.json({ success: false, message: "اكتب سبب اعتماد العائد المحقق في 5 أحرف على الأقل" }, { status: 400 });
    }

    const account = await UserPackage.findOneAndUpdate(
      { _id: userPackageId, status: "active" },
      { $inc: { availableEarnings: amount, totalRealizedEarnings: amount } },
      { new: true }
    );
    if (!account) return NextResponse.json({ success: false, message: "حساب الباقة النشط غير موجود" }, { status: 404 });

    await PackageLedger.create({
      userId: account.userId,
      userPackageId: account._id,
      type: "realized_earning",
      asset: account.asset,
      amount,
      note,
      createdBy: admin._id,
    });

    return NextResponse.json({
      success: true,
      message: "تم تسجيل العائد المحقق وإضافته إلى خانة سحب هذه الباقة.",
      userPackage: account,
    });
  } catch (error) {
    console.error("ADMIN PACKAGE CREDIT:", error);
    return NextResponse.json({ success: false, message: "تعذر تسجيل العائد" }, { status: 500 });
  }
}
