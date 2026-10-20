import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Trade from "@/models/Trade";

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
      const marketFilter: Record<string, unknown> = { mode };

      if (symbol) {
        marketFilter.symbol = symbol;
      }

      const marketTrades = await Trade.find(marketFilter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("symbol takerSide price quantity quoteAmount createdAt")
        .lean();

      // Market tape is public trading data. Never expose buyer/seller or order IDs here.
      return NextResponse.json({
        success: true,
        trades: marketTrades.map((trade: any) => ({
          _id: String(trade._id),
          symbol: String(trade.symbol || ""),
          side: trade.takerSide === "buy" || trade.takerSide === "sell" ? trade.takerSide : null,
          price: Number(trade.price || 0),
          quantity: Number(trade.quantity || 0),
          quoteAmount: Number(trade.quoteAmount || 0),
          createdAt: trade.createdAt,
        })),
      });
    }

    const filter: Record<
      string,
      unknown
    > = {
      mode,
      $or: [
        {
          buyerId: user._id,
        },
        {
          sellerId: user._id,
        },
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
            {
              buyOrderId:
                orderId,
            },
            {
              sellOrderId:
                orderId,
            },
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
          const isBuyer =
            String(
              trade.buyerId
            ) ===
            String(
              user._id
            );

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

            userOrderId:
              isBuyer
                ? String(
                    trade.buyOrderId
                  )
                : String(
                    trade.sellOrderId
                  ),

            counterOrderId:
              isBuyer
                ? String(
                    trade.sellOrderId
                  )
                : String(
                    trade.buyOrderId
                  ),
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