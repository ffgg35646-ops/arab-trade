import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import WithdrawalRequest from "@/models/WithdrawalRequest";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "المعرف مطلوب" },
        { status: 400 }
      );
    }

    await connectDB();

    const item = await WithdrawalRequest.findById(id)
      .populate("userId", "name username email")
      .populate("userPackageId", "packageName")
      .lean();

    if (!item) {
      return NextResponse.json(
        { success: false, message: "طلب السحب غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      item: {
        ...item,
        _id: item._id ? String(item._id) : undefined,
      },
    });
  } catch (error) {
    console.error("ADMIN WITHDRAWALS DETAIL ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل تفاصيل الطلب" },
      { status: 500 }
    );
  }
}