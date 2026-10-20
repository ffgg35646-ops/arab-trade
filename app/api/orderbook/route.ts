import { NextRequest, NextResponse } from "next/server";
import { fetchBinanceJson } from "@/lib/binance-market";

export const dynamic = "force-dynamic";

type DepthSnapshot = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

function toRows(rows: [string, string][]) {
  return (Array.isArray(rows) ? rows : [])
    .map(([priceText, quantityText]) => {
      const price = Number(priceText);
      const quantity = Number(quantityText);
      return { price, quantity, amount: price * quantity, total: price * quantity };
    })
    .filter((row) => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.quantity) && row.quantity > 0);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const symbol = String(url.searchParams.get("symbol") || "")
      .trim().toUpperCase().replace(/[_/\s-]/g, "");
    const requestedDepth = Number(url.searchParams.get("depth") || 20);
    const depth = Math.min(100, Math.max(5, Number.isFinite(requestedDepth) ? Math.floor(requestedDepth) : 20));

    if (!/^[A-Z0-9]{5,25}$/.test(symbol)) {
      return NextResponse.json({ success: false, message: "زوج التداول غير صالح" }, { status: 400 });
    }

    const snapshot = await fetchBinanceJson<DepthSnapshot>(
      "depth?symbol=" + encodeURIComponent(symbol) + "&limit=" + depth,
      1,
    );
    const bids = toRows(snapshot.bids);
    const asks = toRows(snapshot.asks);

    if (!bids.length || !asks.length) {
      return NextResponse.json({ success: false, message: "دفتر Binance غير متاح لهذا الزوج حاليًا" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      source: "binance",
      updatedAt: Date.now(),
      orderBook: {
        source: "binance",
        lastUpdateId: snapshot.lastUpdateId,
        bids,
        asks,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("BINANCE ORDERBOOK GET:", error);
    return NextResponse.json({
      success: false,
      message: "تعذر تحميل دفتر أوامر Binance الحقيقي حاليًا. حاول مرة أخرى.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
