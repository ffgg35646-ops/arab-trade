import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import Order from "@/models/Order";

export const dynamic = "force-dynamic";

const round8 = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  await connectDB();

  const body = await request.json().catch(() => ({}));
  const orderId = String(body.orderId || "").trim();
  const action = String(body.action || "").trim();

  if (!mongoose.isValidObjectId(orderId) || !["below-minimum", "dismiss-empty"].includes(action)) {
    return NextResponse.json({ success: false, message: "بيانات متابعة التحويل غير صحيحة" }, { status: 400 });
  }

  const order: any = await Order.findOne({
    _id: orderId,
    userId: user._id,
    mode: "live",
    executionProvider: "binance",
    purpose: "withdrawal-conversion",
    withdrawalConversionStatus: "pending",
    side: "sell",
    symbol: { $regex: /USDT$/ },
    status: { $in: ["filled", "cancelled"] },
    locksReleased: true,
  }).lean();

  if (!order) {
    return NextResponse.json({ success: false, message: "أمر التحويل غير موجود أو تمت معالجته بالفعل" }, { status: 409 });
  }

  const quantity = round8(Number(order.settledExecutedQuantity || 0));
  const grossQuote = round8(Number(order.settledQuoteQuantity || 0));
  const tradingFee = round8(Number(order.settledFeeAmount || 0));
  const proceeds = round8(Math.max(0, grossQuote - tradingFee));

  if (action === "dismiss-empty") {
    if (quantity > 0 || proceeds > 0) {
      return NextResponse.json({ success: false, message: "أمر البيع يحتوي على حصيلة؛ لا يمكن إغلاقه كأمر بلا تنفيذ" }, { status: 409 });
    }
  } else {
    const settings = await getPlatformSettings();
    const minimum = Number(settings.withdrawals?.generalMinimum || 0);
    if (proceeds <= 0 || minimum <= 0 || proceeds >= minimum) {
      return NextResponse.json({ success: false, message: "لا يمكن تصنيف هذه الحصيلة على أنها أقل من الحد الأدنى" }, { status: 409 });
    }
  }

  const updated = await Order.updateOne(
    { _id: order._id, userId: user._id, withdrawalConversionStatus: "pending" },
    { $set: { withdrawalConversionStatus: action === "below-minimum" ? "below_minimum" : "dismissed" } },
  );

  if (updated.modifiedCount !== 1) {
    return NextResponse.json({ success: false, message: "تم تحديث حالة أمر التحويل بالفعل" }, { status: 409 });
  }

  return NextResponse.json({ success: true, status: action === "below-minimum" ? "below_minimum" : "dismissed", proceeds });
}
