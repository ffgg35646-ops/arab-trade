
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import FuturesOrder from "@/models/FuturesOrder";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    await connectDB();

    const body = await request.json();

    const order = await FuturesOrder.findOne({
      _id: String(body.id || ""),
      userId: user._id,
      status: "open"
    });

    if (!order) {
      return NextResponse.json(
        { error: "الطلب غير موجود أو تم إغلاقه" },
        { status: 404 }
      );
    }

    order.status = "cancelled";
    await order.save();

    return NextResponse.json({
      success: true,
      order
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر إلغاء الطلب" },
      { status: 400 }
    );
  }
}