import { NextResponse } from "next/server";
import {
  fetchBinanceJson,
  isActiveBinanceSpotPair,
  type BinanceSpotSymbol,
} from "@/lib/binance-market";
import { isBinanceLiveTradingConfigured } from "@/lib/binance-trading";

export const dynamic = "force-dynamic";

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  count: number;
};

export async function GET() {
  try {
    const [info, tickers] = await Promise.all([
      fetchBinanceJson<{ symbols?: BinanceSpotSymbol[] }>("exchangeInfo", 60),
      fetchBinanceJson<BinanceTicker[]>("ticker/24hr", 15),
    ]);
    const tickerBySymbol = new Map(
      (Array.isArray(tickers) ? tickers : []).map((ticker) => [ticker.symbol, ticker])
    );

    const pairs = (info.symbols || [])
      .filter(isActiveBinanceSpotPair)
      .map((pair) => {
        const ticker = tickerBySymbol.get(pair.symbol);
        return {
          symbol: pair.symbol,
          baseAsset: pair.baseAsset,
          quoteAsset: pair.quoteAsset,
          status: pair.status,
          lastPrice: Number(ticker?.lastPrice || 0),
          priceChangePercent: Number(ticker?.priceChangePercent || 0),
          highPrice: Number(ticker?.highPrice || 0),
          lowPrice: Number(ticker?.lowPrice || 0),
          baseVolume: Number(ticker?.volume || 0),
          quoteVolume: Number(ticker?.quoteVolume || 0),
          tradeCount: Number(ticker?.count || 0),
        };
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    return NextResponse.json({
      success: true,
      updatedAt: Date.now(),
      count: pairs.length,
      quotes: [...new Set(pairs.map((pair) => pair.quoteAsset))].sort(),
      execution: {
        provider: "binance",
        configured: isBinanceLiveTradingConfigured(),
        testnet: process.env.BINANCE_TRADE_TESTNET === "true",
      },
      pairs,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("BINANCE SPOT MARKET LIST:", error);
    return NextResponse.json({
      success: false,
      message: "تعذر تحميل أزواج Binance Spot حاليًا. حاول مرة أخرى.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
