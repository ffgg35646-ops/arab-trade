import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { buildOrderBook } from "@/lib/orderbook";

export async function GET(
  request: NextRequest
) {
  try {
    await connectDB();

    const url =
      new URL(request.url);

    const symbol =
      String(
        url.searchParams.get(
          "symbol"
        ) || ""
      )
        .trim()
        .toUpperCase();

    const modeParam =
      String(
        url.searchParams.get(
          "mode"
        ) || "live"
      )
        .trim()
        .toLowerCase();

    const mode =
      modeParam === "demo"
        ? "demo"
        : "live";

    if (!symbol) {
      return NextResponse.json(
        {
          success: false,
          message:
            "زوج التداول مطلوب",
        },
        { status: 400 }
      );
    }

    const book =
      await buildOrderBook(
        symbol,
        mode,
        1
      );

    return NextResponse.json({
      success: true,
      ticker: {
        symbol,
        mode,
        lastPrice:
          book.lastPrice,
        bestBid:
          book.bestBid,
        bestAsk:
          book.bestAsk,
        spread:
          book.spread,
        lastQuantity:
          book.lastQuantity,
        lastQuoteAmount:
          book.lastQuoteAmount,
        updatedAt:
          book.updatedAt,
      },
    });
  } catch (error) {
    console.error(
      "TICKER GET:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحميل السعر",
      },
      { status: 500 }
    );
  }
}
