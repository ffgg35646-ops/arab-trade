
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import MarginPosition from "@/models/MarginPosition";
import FuturesPosition from "@/models/FuturesPosition";
import {
  calculatePnl,
  marginRatio
} from "@/lib/risk-engine";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "غير مصرح" },
        { status: 401 }
      );
    }

    await connectDB();

    const margin = await MarginPosition.find({
      userId: user._id,
      status: "open"
    }).lean();

    const futures = await FuturesPosition.find({
      userId: user._id,
      status: "open"
    }).lean();

    const marginRisk = margin.map((p: any) => {
      const pnl = calculatePnl(
        p.side,
        p.entryPrice,
        p.markPrice,
        p.quantity
      );

      return {
        id: String(p._id),
        symbol: p.symbol,
        side: p.side,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
        quantity: p.quantity,
        leverage: p.leverage,
        margin: p.margin,
        borrowed: p.borrowed,
        pnl,
        ratio: marginRatio(
          Number(p.margin || 0) + pnl,
          Number(p.borrowed || 0)
        )
      };
    });

    const futuresRisk = futures.map((p: any) => {
      const pnl = calculatePnl(
        p.side,
        p.entryPrice,
        p.markPrice,
        p.quantity
      );

      return {
        id: String(p._id),
        symbol: p.symbol,
        side: p.side,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
        quantity: p.quantity,
        leverage: p.leverage,
        marginMode: p.marginMode,
        margin: p.margin,
        liquidationPrice: p.liquidationPrice,
        pnl
      };
    });

    return NextResponse.json({
      margin: marginRisk,
      futures: futuresRisk
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر حساب المخاطر" },
      { status: 400 }
    );
  }
}