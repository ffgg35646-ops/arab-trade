import { NextRequest, NextResponse } from "next/server";
import { fetchBinanceJson, getBinanceSpotPair } from "@/lib/binance-market";

export const dynamic = "force-dynamic";

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
};
type BinanceOrderBook = { bids: [string, string][]; asks: [string, string][] };
type BinanceTrade = { price: string; qty: string; time: number; isBuyerMaker: boolean };
type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

const allowedIntervals = new Set(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]);

export async function GET(request: NextRequest) {
  const symbol = String(request.nextUrl.searchParams.get("symbol") || "BTCUSDT")
    .toUpperCase().replace(/[_/\s-]/g, "");
  const rawInterval = String(request.nextUrl.searchParams.get("interval") || "1h");
  const interval = allowedIntervals.has(rawInterval) ? rawInterval : "1h";

  if (!/^[A-Z0-9]{5,25}$/.test(symbol)) {
    return NextResponse.json({ error: "زوج التداول غير صالح" }, { status: 400 });
  }

  try {
    const pair = await getBinanceSpotPair(symbol);
    if (!pair) {
      return NextResponse.json({ error: "الزوج غير متاح ضمن أزواج Binance Spot النشطة" }, { status: 404 });
    }

    const [ticker, book, trades, klines] = await Promise.all([
      fetchBinanceJson<BinanceTicker>("ticker/24hr?symbol=" + encodeURIComponent(symbol), 10),
      fetchBinanceJson<BinanceOrderBook>("depth?symbol=" + encodeURIComponent(symbol) + "&limit=20", 5).catch(() => null),
      fetchBinanceJson<BinanceTrade[]>("trades?symbol=" + encodeURIComponent(symbol) + "&limit=30", 5).catch(() => []),
      fetchBinanceJson<BinanceKline[]>("klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + interval + "&limit=100", 15).catch(() => []),
    ]);

    return NextResponse.json({
      ticker: {
        symbol: ticker.symbol,
        lastPrice: ticker.lastPrice,
        priceChangePercent: ticker.priceChangePercent,
        highPrice: ticker.highPrice,
        lowPrice: ticker.lowPrice,
        volume: ticker.volume,
        quoteVolume: ticker.quoteVolume,
      },
      book: {
        bids: (book?.bids || []).map(([price, quantity]) => ({ price, quantity })),
        asks: (book?.asks || []).map(([price, quantity]) => ({ price, quantity })),
      },
      trades: (trades || []).map((trade) => ({
        price: trade.price, qty: trade.qty, time: trade.time, isBuyerMaker: trade.isBuyerMaker,
      })),
      candles: (klines || []).map((candle) => ({
        time: Number(candle[0]), open: Number(candle[1]), high: Number(candle[2]),
        low: Number(candle[3]), close: Number(candle[4]), volume: Number(candle[5]),
      })).filter((candle) => Number.isFinite(candle.close) && candle.close > 0),
      marketSource: "Binance Spot public market data",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("BINANCE TRADING MARKET:", error);
    return NextResponse.json({ error: "تعذر الاتصال ببيانات Binance Spot حاليًا" }, {
      status: 502, headers: { "Cache-Control": "no-store" },
    });
  }
}
