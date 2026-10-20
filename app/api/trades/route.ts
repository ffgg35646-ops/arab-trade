import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Trade from "@/models/Trade";
import { getBinanceRecentTrades } from "@/lib/binance-trading";

export async function GET(
  request: NextRequest
) {
  try {
    await connectDB();

    const user =
      await getCurrentUser(
        request
      );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message:
            "غير مصرح",
        },
        { status: 401 }
      );
    }

    const url =
      new URL(
        request.url
      );

    const symbol =
      String(
        url.searchParams.get(
          "symbol"
        ) || ""
      )
        .trim()
        .toUpperCase()
        .replace(/[_/\s-]/g, "");

    const orderId =
      String(
        url.searchParams.get(
          "orderId"
        ) || ""
      ).trim();

    const mode = "live";

    const requestedLimit =
      Number(
        url.searchParams.get(
          "limit"
        ) || 100
      );

    const limit =
      Math.min(
        Math.max(
          Number.isFinite(
            requestedLimit
          )
            ? Math.floor(
                requestedLimit
              )
            : 100,
          1
        ),
        500
      );

    if (url.searchParams.get("market") === "true") {
      if (!symbol) {
        return NextResponse.json({ success: false, message: "زوج التداول مطلوب لعرض صفقات السوق" }, { status: 400 });
      }
      const marketTrades = await getBinanceRecentTrades(symbol, limit);
      return NextResponse.json({
        success: true,
        source: "binance",
        trades: marketTrades.map((trade) => {
          const price = Number(trade.price);
          const quantity = Number(trade.qty);
          return {
            _id: String(trade.id),
            externalTradeId: String(trade.id),
            symbol,
            side: trade.isBuyerMaker ? "sell" : "buy",
            price,
            quantity,
            quoteAmount: Number.isFinite(Number(trade.quoteQty)) ? Number(trade.quoteQty) : price * quantity,
            createdAt: new Date(trade.time).toISOString(),
            executionProvider: "binance",
          };
        }),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const filter: Record<
      string,
      unknown
    > = {
      mode,
      $or: [
        { buyerId: user._id },
        { sellerId: user._id },
        { userId: user._id },
      ],
    };

    if (symbol) {
      filter.symbol = symbol;
    }

    /*
     * يدعم جلب التنفيذات المرتبطة بأمر
     * محدد من نافذة تفاصيل الأمر.
     */
    if (orderId) {
      filter.$and = [
        {
          $or: [
            { buyOrderId: orderId },
            { sellOrderId: orderId },
            { orderId },
          ],
        },
      ];
    }

    const trades =
      await Trade.find(
        filter
      )
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean();

    const normalized =
      trades.map(
        (trade: any) => {
          const externalUserTrade = String(trade.userId || "") === String(user._id) &&
            String(trade.executionProvider || "") === "binance";
          const isBuyer = externalUserTrade
            ? trade.side === "buy"
            : String(trade.buyerId) === String(user._id);

          return {
            ...trade,

            role:
              isBuyer
                ? "buyer"
                : "seller",

            side:
              isBuyer
                ? "buy"
                : "sell",

            userOrderId: externalUserTrade
              ? String(trade.orderId || "")
              : isBuyer
                ? String(trade.buyOrderId)
                : String(trade.sellOrderId),

            counterOrderId: externalUserTrade
              ? ""
              : isBuyer
                ? String(trade.sellOrderId)
                : String(trade.buyOrderId),
          };
        }
      );

    return NextResponse.json({
      success: true,
      trades: normalized,
    });
  } catch (error) {
    console.error(
      "TRADES GET:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحميل سجل التداول",
      },
      { status: 500 }
    );
  }
}