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

    const symbol = String(body.symbol || "").toUpperCase();
    const side = String(body.side || "");
    const quantity = Number(body.quantity);
    const entryPrice = Number(body.entryPrice);
    const leverage = Number(body.leverage || 1);
    const marginMode = body.marginMode === "cross" ? "cross" : "isolated";

    if (!symbol || !["long", "short"].includes(side)) {
      return NextResponse.json({ error: "بيانات العقد غير صحيحة" }, { status: 400 });
    }

    if (
      !Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(entryPrice) || entryPrice <= 0 ||
      !Number.isFinite(leverage) || leverage < 1 || leverage > 125
    ) {
      return NextResponse.json({ error: "القيم غير صحيحة" }, { status: 400 });
    }

    const existing = await FuturesPosition.findOne({
      userId: user._id,
      symbol,
      status: "open"
    });

    if (existing) {
      return NextResponse.json(
        { error: "توجد صفقة عقود مفتوحة على هذا الزوج" },
        { status: 409 }
      );
    }

    const notional = quantity * entryPrice;
    const margin = notional / leverage;

    const liquidationDistance =
      entryPrice * (1 / leverage) * 0.9;

    const liquidationPrice =
      side === "long"
        ? Math.max(0, entryPrice - liquidationDistance)
        : entryPrice + liquidationDistance;

    const position = await FuturesPosition.create({
      userId: user._id,
      symbol,
      side,
      quantity,
      entryPrice,
      markPrice: entryPrice,
      leverage,
      marginMode,
      margin,
      pnl: 0,
      liquidationPrice,
      status: "open"
    });

    return NextResponse.json({ success: true, position }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر فتح العقد" },
      { status: 400 }
    );
  }
}