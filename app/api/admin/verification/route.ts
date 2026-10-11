
import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import VerificationRequest from "@/models/VerificationRequest";
import User from "@/models/User";

export async function GET(request: NextRequest) {
  try {
    await requireAdminLeader(request);
    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const query: Record<string, any> = {};
    if (status) query.status = status;

    const rows = await VerificationRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ requests: rows });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unauthorized" },
      { status: 401 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    await connectDB();

    const body = await request.json();
    const id = String(body.id || "");
    const status = body.status as "pending" | "approved" | "rejected";
    const adminNote = String(body.adminNote || "");

    if (!id || !["approved", "rejected", "pending"].includes(status)) {
      return NextResponse.json(
        { error: "بيانات المراجعة غير صحيحة" },
        { status: 400 }
      );
    }

    const row = await VerificationRequest.findById(id);

    if (!row) {
      return NextResponse.json(
        { error: "طلب التحقق غير موجود" },
        { status: 404 }
      );
    }

    row.status = status;
    row.adminNote = adminNote;
    row.reviewedAt = new Date();
    await row.save();

    if (status === "approved") {
      await User.findByIdAndUpdate(row.userId, {
        isVerified: true
      });
    }

    if (status === "rejected") {
      await User.findByIdAndUpdate(row.userId, {
        isVerified: false
      });
    }

    return NextResponse.json({ success: true, request: row });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "فشل تحديث الطلب" },
      { status: 400 }
    );
  }
}