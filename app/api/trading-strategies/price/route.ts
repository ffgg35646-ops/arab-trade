import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getBinanceSpotPair } from "@/lib/binance-market";
import { getBinancePublicPrice } from "@/lib/binance-trading";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  }

  const symbol = String(request.nextUrl.searchParams.get("symbol") || "")
    .trim().toUpperCase().replace(/[_/\s-]/g, "");
  if (!/^[A-Z0-9]{5,25}$/.test(symbol)) {
    return NextResponse.json({ success: false, message: "زوج التداول غير صالح" }, { status: 400 });
  }

  try {
    const pair = await getBinanceSpotPair(symbol);
    if (!pair) {
      return NextResponse.json({ success: false, message: "زوج التداول غير نشط على Binance Spot" }, { status: 404 });
    }
    const price = await getBinancePublicPrice(symbol);
    return NextResponse.json({
      success: true,
      symbol,
      baseAsset: pair.baseAsset,
      quoteAsset: pair.quoteAsset,
      price,
      source: process.env.BINANCE_TRADE_TESTNET === "true" ? "binance-spot-testnet" : "binance-spot",
      updatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "تعذر قراءة سعر التداول الحالي",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
