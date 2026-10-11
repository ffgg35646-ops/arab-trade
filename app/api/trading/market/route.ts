import { NextRequest, NextResponse } from "next/server";

const BINANCE_API = "https://api.binance.com";

export async function GET(request: NextRequest) {
  const symbol =
    request.nextUrl.searchParams.get("symbol")?.toUpperCase() ||
    "BTCUSDT";

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return NextResponse.json(
      { error: "Invalid symbol" },
      { status: 400 }
    );
  }

  try {
    const [tickerResponse, bookResponse, tradesResponse] =
      await Promise.all([
        fetch(
          `${BINANCE_API}/api/v3/ticker/24hr?symbol=${symbol}`,
          { cache: "no-store" }
        ),
        fetch(
          `${BINANCE_API}/api/v3/depth?symbol=${symbol}&limit=20`,
          { cache: "no-store" }
        ),
        fetch(
          `${BINANCE_API}/api/v3/trades?symbol=${symbol}&limit=30`,
          { cache: "no-store" }
        ),
      ]);

    if (
      !tickerResponse.ok ||
      !bookResponse.ok ||
      !tradesResponse.ok
    ) {
      return NextResponse.json(
        { error: "Market data unavailable" },
        { status: 502 }
      );
    }

    const ticker = await tickerResponse.json();
    const book = await bookResponse.json();
    const trades = await tradesResponse.json();

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
        bids: book.bids.map(
          ([price, quantity]: [string, string]) => ({
            price,
            quantity,
          })
        ),

        asks: book.asks.map(
          ([price, quantity]: [string, string]) => ({
            price,
            quantity,
          })
        ),
      },

      trades: trades.map(
        (trade: {
          price: string;
          qty: string;
          time: number;
          isBuyerMaker: boolean;
        }) => ({
          price: trade.price,
          qty: trade.qty,
          time: trade.time,
          isBuyerMaker: trade.isBuyerMaker,
        })
      ),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to connect to market" },
      { status: 502 }
    );
  }
}