import { NextRequest, NextResponse } from "next/server";
import { connectDB as dbConnect } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { matchOrder } from "@/lib/matching-engine";
import Order from "@/models/Order";

export async function POST(request: NextRequest) {
  await dbConnect();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.orderId || "");

  const mode =
    String(body.mode || "live")
      .trim()
      .toLowerCase() === "demo"
      ? "demo"
      : "live";

  if (!id) {
    return NextResponse.json({ success: false, message: "معرف الأمر مطلوب" }, { status: 400 });
  }

  const order = await Order.findOne({
    _id: id,
    userId: user._id,
    mode,
  });

  if (!order) {
    return NextResponse.json({ success: false, message: "الأمر غير موجود" }, { status: 404 });
  }

  const result = await matchOrder(id, mode);

  return NextResponse.json({
    success: true,
    ...result,
  });
}