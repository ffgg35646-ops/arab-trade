import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import KycRequest from "@/models/KycRequest";

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

    await connectDB();

    const item = await KycRequest.findById(id)
      .populate("userId", "_id name username email isVerified isActive createdAt")
      .lean();

    if (!item) {
      return NextResponse.json(
        { success: false, message: "طلب التوثيق غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      item: {
        ...item,
        _id: String(item._id),
        userId: item.userId
          ? {
              ...(item.userId as any),
              _id: String((item.userId as any)._id),
            }
          : null,
      },
    });
  } catch (error) {
    console.error("ADMIN KYC DETAIL ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل تفاصيل طلب التوثيق" },
      { status: 500 }
    );
  }
}