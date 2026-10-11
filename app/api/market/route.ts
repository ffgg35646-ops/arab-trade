import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets" +
      "?vs_currency=usd" +
      "&order=market_cap_desc" +
      "&per_page=100" +
      "&page=1" +
      "&sparkline=true" +
      "&price_change_percentage=1h,24h,7d";

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
      next: {
        revalidate: 30,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "تعذر الحصول على بيانات السوق" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      updatedAt: Date.now(),
      coins: data,
    });
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ أثناء الاتصال ببيانات السوق" },
      { status: 500 }
    );
  }
}