import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import DepositRequest from "@/models/DepositRequest";

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

    const item = await DepositRequest.findById(id).select("-screenshotData").lean();

    if (!item) {
      return NextResponse.json(
        { success: false, message: "طلب الإيداع غير موجود" },
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
    console.error("ADMIN DEPOSITS DETAIL ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل تفاصيل الطلب" },
      { status: 500 }
    );
  }
}