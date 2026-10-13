import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import FuturesPosition from "@/models/FuturesPosition";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    await connectDB();
    await migrateLegacyDepositBalancesToSpotWallet(user._id);
    const body = await request.json();

    const position = await FuturesPosition.findOne({
      _id: String(body.id || ""),
      userId: user._id,
      status: "open"
    });

    if (!position) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const exitPrice = Number(body.exitPrice);

    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      return NextResponse.json({ error: "سعر الإغلاق غير صحيح" }, { status: 400 });
    }

    position.markPrice = exitPrice;

    const delta =
      position.side === "long"
        ? exitPrice - position.entryPrice
        : position.entryPrice - exitPrice;

    position.pnl = Number((delta * position.quantity).toFixed(12));
    position.status = "closed";

    await position.save();

    return NextResponse.json({
      success: true,
      pnl: position.pnl,
      position
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر إغلاق العقد" },
      { status: 400 }
    );
  }
}