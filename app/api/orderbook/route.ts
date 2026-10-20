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
        .toUpperCase()
        .replace(/[_/\s-]/g, "");

    const mode = "live";

    const depth =
      Number(
        url.searchParams.get(
          "depth"
        ) || 20
      );

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

    const orderBook =
      await buildOrderBook(
        symbol,
        mode,
        depth
      );

    return NextResponse.json({
      success: true,
      orderBook,
    });
  } catch (error) {
    console.error(
      "ORDERBOOK GET:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحميل دفتر الأوامر",
      },
      { status: 500 }
    );
  }
}
