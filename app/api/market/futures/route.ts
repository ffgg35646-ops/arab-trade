import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
type Contract = { symbol: string; status: string; contractType: string; baseAsset: string; quoteAsset: string };
type Ticker = { symbol: string; lastPrice: string; priceChangePercent: string; highPrice: string; lowPrice: string; volume: string; quoteVolume: string; count: number };
export async function GET() {
  try {
    const [infoResponse, tickerResponse] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v1/exchangeInfo", { headers: { accept: "application/json" }, next: { revalidate: 60 } }),
      fetch("https://fapi.binance.com/fapi/v1/ticker/24hr", { headers: { accept: "application/json" }, next: { revalidate: 15 } }),
    ]);
    if (!infoResponse.ok || !tickerResponse.ok) throw new Error("Binance Futures returned a non-success response");
    const info = await infoResponse.json() as { symbols?: Contract[] };
    const tickers = await tickerResponse.json() as Ticker[];
    const tickerBySymbol = new Map((Array.isArray(tickers) ? tickers : []).map((item) => [item.symbol, item]));
    const pairs = (info.symbols || [])
      .filter((item) => item.status === "TRADING" && item.contractType === "PERPETUAL" && item.quoteAsset === "USDT")
      .map((item) => {
        const ticker = tickerBySymbol.get(item.symbol);
        return { symbol: item.symbol, baseAsset: item.baseAsset, quoteAsset: item.quoteAsset, lastPrice: Number(ticker?.lastPrice || 0), priceChangePercent: Number(ticker?.priceChangePercent || 0), highPrice: Number(ticker?.highPrice || 0), lowPrice: Number(ticker?.lowPrice || 0), baseVolume: Number(ticker?.volume || 0), quoteVolume: Number(ticker?.quoteVolume || 0), tradeCount: Number(ticker?.count || 0) };
      }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
    return NextResponse.json({ success:true, updatedAt:Date.now(), count:pairs.length, quotes:[...new Set(pairs.map(p=>p.quoteAsset))], pairs, source:"Binance USDⓈ-M perpetual futures public market data" }, { headers:{"Cache-Control":"no-store"} });
  } catch (error) {
    console.error("BINANCE FUTURES MARKET LIST:", error);
    return NextResponse.json({ success:false, message:"تعذر تحميل عقود Binance Futures حاليًا. حاول مرة أخرى." }, { status:502, headers:{"Cache-Control":"no-store"} });
  }
}
