import { NextRequest, NextResponse } from "next/server";
import { connectDB as dbConnect } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { matchOrder } from "@/lib/matching-engine";
import Order from "@/models/Order";
import { reconcileBinanceLiveOrder } from "@/lib/binance-live-orders";

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

  if (order.executionProvider === "binance") {
    try {
      const result = await reconcileBinanceLiveOrder(id);
      const matched = result.trades.reduce((sum: number, trade: any) => sum + Number(trade.quantity || 0), 0);
      return NextResponse.json({
        success: true,
        executionProvider: "binance",
        order: result.order,
        matching: { matched, trades: result.trades },
        message: matched > 0 ? "تم تحديث التنفيذ المؤكد من Binance." : "تم تحديث حالة الأمر من Binance؛ لا توجد كمية جديدة منفذة.",
      });
    } catch (error) {
      console.error("BINANCE ORDER RECONCILIATION:", error);
      return NextResponse.json({ success: false, message: "تعذر تحديث حالة الأمر من Binance." }, { status: 502 });
    }
  }

  const result = await matchOrder(id, mode);

  return NextResponse.json({
    success: true,
    ...result,
  });
}