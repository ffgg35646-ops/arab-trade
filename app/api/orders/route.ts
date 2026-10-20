import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { getBinanceSpotPair } from "@/lib/binance-market";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Asset from "@/models/Asset";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import { consolidateFundingWalletIntoSpotWallet } from "@/lib/consolidate-funding-wallet";
import {
  getIdempotentResponse,
  hashRequest,
} from "@/lib/idempotency";
import IdempotencyKey from "@/models/IdempotencyKey";
import { submitBinanceLiveOrder, reconcileBinanceLiveOrder } from "@/lib/binance-live-orders";
import { isBinanceLiveTradingConfigured } from "@/lib/binance-trading";

function splitPair(
  symbol: string,
  knownAssets: string[]
) {
  const sorted = [...knownAssets]
    .map((x) =>
      String(x).toUpperCase()
    )
    .sort(
      (a, b) =>
        b.length - a.length
    );

  for (const quote of sorted) {
    if (
      symbol.endsWith(quote) &&
      symbol.length > quote.length
    ) {
      return {
        base: symbol.slice(
          0,
          -quote.length
        ),
        quote,
      };
    }
  }

  return null;
}

export async function GET(
  request: NextRequest
) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const url =
      new URL(request.url);

    const symbol =
      String(url.searchParams.get("symbol") || "")
        .trim()
        .toUpperCase()
        .replace(/[_/\s-]/g, "");

    const mode = "live";

    if (isBinanceLiveTradingConfigured()) {
      const staleBefore = new Date(Date.now() - 10000);
      const pendingExternalOrders = await Order.find({
        userId: user._id,
        mode: "live",
        executionProvider: "binance",
        status: "open",
        updatedAt: { $lte: staleBefore },
      }).select("_id").sort({ updatedAt: 1 }).limit(5).lean();
      await Promise.all(pendingExternalOrders.map(async (item: any) => {
        try {
          await reconcileBinanceLiveOrder(String(item._id));
        } catch (syncError) {
          console.error("BINANCE ORDER SYNC:", String(item._id), syncError);
        }
      }));
    }

    const status =
      String(
        url.searchParams.get(
          "status"
        ) || ""
      )
        .trim()
        .toLowerCase();

    const side =
      String(
        url.searchParams.get(
          "side"
        ) || ""
      )
        .trim()
        .toLowerCase();

    const type =
      String(
        url.searchParams.get(
          "type"
        ) || ""
      )
        .trim()
        .toLowerCase();

    const requestedLimit =
      Number(
        url.searchParams.get(
          "limit"
        ) || 500
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
            : 500,
          1
        ),
        500
      );

    const filter:
      Record<string, unknown> = {
        userId: user._id,
        mode,
      };

    if (symbol) {
      filter.symbol = symbol;
    }

    if (
      status &&
      [
        "open",
        "cancelled",
        "filled",
        "rejected",
      ].includes(status)
    ) {
      filter.status = status;
    }

    if (
      side &&
      ["buy", "sell"].includes(side)
    ) {
      filter.side = side;
    }

    if (
      type &&
      ["limit", "market"].includes(type)
    ) {
      filter.type = type;
    }

    const purpose = String(url.searchParams.get("purpose") || "").trim();
    if (purpose === "spot" || purpose === "withdrawal-conversion") {
      filter.purpose = purpose;
    }

    const orders =
      await Order.find(filter)
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean();

    const normalizedOrders =
      orders.map(
        (order: any) => {
          const remaining =
            Math.max(
              0,
              Number(
                order.quantity || 0
              )
            );

          const explicitFilled =
            Number(
              order.filledQuantity
            );

          const original =
            Number(
              order.originalQuantity
            );

          let filledQuantity =
            Number.isFinite(
              explicitFilled
            )
              ? Math.max(
                  0,
                  explicitFilled
                )
              : 0;

          if (
            filledQuantity === 0 &&
            Number.isFinite(
              original
            ) &&
            original >= remaining
          ) {
            filledQuantity =
              Math.max(
                0,
                original - remaining
              );
          }

          const originalQuantity =
            Number.isFinite(
              original
            ) &&
            original >= 0
              ? original
              : remaining +
                filledQuantity;

          const progress =
            originalQuantity > 0
              ? Math.min(
                  100,
                  Math.max(
                    0,
                    (filledQuantity /
                      originalQuantity) *
                      100
                  )
                )
              : 0;

          return {
            ...order,
            quantity:
              remaining,
            originalQuantity,
            filledQuantity,
            remainingQuantity:
              remaining,
            fillPercent:
              Number(
                progress.toFixed(4)
              ),
          };
        }
      );

    return NextResponse.json({
      success: true,
      orders:
        normalizedOrders,
    });
  } catch (error) {
    console.error(
      "ORDERS GET:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحميل الأوامر",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  let idempotencyRequestHash = "";

  let idempotencyUserId:
    mongoose.Types.ObjectId | null =
    null;

  const idempotencyKey =
    request.headers.get(
      "Idempotency-Key"
    )?.trim() || "";

  const idempotencyRoute =
    "/api/orders";

  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    idempotencyUserId = user._id;

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const mode: "live" = "live";
    await migrateLegacyDepositBalancesToSpotWallet(user._id);
    await consolidateFundingWalletIntoSpotWallet(user._id);

    const settings =
      await getPlatformSettings();

    if (
      !settings.trading.enabled ||
      !settings.trading.spotEnabled
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "التداول الفوري متوقف حاليًا",
        },
        { status: 403 }
      );
    }

    const requestHash =
      hashRequest(body);

    idempotencyRequestHash =
      requestHash;

    // -----------------------------------------------------
    // If this exact idempotency key already exists,
    // return the previous response instead of creating
    // another order.
    // -----------------------------------------------------
    if (idempotencyKey) {
      const existing =
        await getIdempotentResponse(
          user._id,
          idempotencyRoute,
          idempotencyKey
        );

      if (existing) {
        if (
          existing.requestHash !==
          requestHash
        ) {
          return NextResponse.json(
            {
              success: false,
              message:
                "مفتاح Idempotency مستخدم مع طلب مختلف",
            },
            { status: 409 }
          );
        }

        return NextResponse.json(
          existing.responseBody,
          {
            status:
              existing.responseStatus,
          }
        );
      }
    }

    const symbol =
      String(body.symbol || "")
        .trim()
        .toUpperCase()
        .replace(/[_/\s-]/g, "");

    const side =
      String(
        body.side || ""
      ) as "buy" | "sell";

    const type =
      String(
        body.type || "limit"
      ) as "limit" | "market";

    let price =
      Number(body.price);

    const quantity =
      Number(body.quantity);

    if (
      !symbol ||
      !/^[A-Z0-9]{5,25}$/.test(symbol) ||
      !["buy", "sell"].includes(
        side
      ) ||
      !["limit", "market"].includes(
        type
      ) ||
      !Number.isFinite(
        quantity
      ) ||
      quantity <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "بيانات الأمر غير صحيحة",
        },
        { status: 400 }
      );
    }

    if (
      type !== "market" &&
      (
        !Number.isFinite(price) ||
        price <= 0
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "سعر الأمر غير صحيح",
        },
        { status: 400 }
      );
    }

    const quoteAmount =
      type === "market"
        ? 0
        : price * quantity;

    const feePercent =
      Number(
        settings.trading.defaultFeePercent || 0
      );

if (
      type === "limit" &&
      (
        !Number.isFinite(
          quoteAmount
        ) ||
        quoteAmount <= 0 ||
        quoteAmount <
          settings.trading
            .minOrderAmount ||
        quoteAmount >
          settings.trading
            .maxOrderAmount
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `قيمة الأمر يجب أن تكون بين ${settings.trading.minOrderAmount} و ${settings.trading.maxOrderAmount}`,
        },
        { status: 400 }
      );
    }

    const binancePair = await getBinanceSpotPair(symbol);
    if (!binancePair) {
      return NextResponse.json(
        { success: false, message: "هذا الزوج غير متاح ضمن أزواج Binance Spot النشطة." },
        { status: 400 }
      );
    }

    // Only create a missing asset after Binance confirms the pair is active.
    // Never override an administrator's disabled/tradingDisabled flags.
    for (const assetSymbol of [binancePair.baseAsset, binancePair.quoteAsset]) {
      await Asset.updateOne(
        { symbol: assetSymbol },
        {
          $setOnInsert: {
            name: assetSymbol,
            symbol: assetSymbol,
            type: "crypto",
            enabled: true,
            tradingEnabled: true,
            depositEnabled: false,
            sortOrder: 99999,
            networks: [],
          },
        },
        { upsert: true }
      );
    }

    const assets = await Asset.find({
      enabled: true,
      tradingEnabled: true,
    }).select("symbol").lean();

    const pair = splitPair(symbol, assets.map((asset) => asset.symbol));
    if (!pair || pair.base !== binancePair.baseAsset || pair.quote !== binancePair.quoteAsset) {
      return NextResponse.json(
        { success: false, message: "إحدى عملتي هذا الزوج غير مفعّلة للتداول في إعدادات عرب تريد." },
        { status: 403 }
      );
    }

    // Real/live spot orders go to Binance. If the exchange connection is not
    // configured, this path returns an explicit error and never pretends an
    // internal match is an external-market fill.
    const liveExecution = await submitBinanceLiveOrder({
      userId: user._id,
      symbol,
      side,
      type,
      price,
      quantity,
      baseAsset: binancePair.baseAsset,
      quoteAsset: binancePair.quoteAsset,
      pair: binancePair,
      feePercent,
      purpose: body.purpose === "withdrawal-conversion" ? "withdrawal-conversion" : "spot",
      minOrderAmount: Number(settings.trading.minOrderAmount || 10),
      maxOrderAmount: Number(settings.trading.maxOrderAmount || 100000),
      idempotencyKey,
      requestHash,
      idempotencyRoute,
    });
    return NextResponse.json(liveExecution.body, { status: liveExecution.status });

  } catch (error: any) {
    // -------------------------------------------------------
    // A concurrent request may have raced using the same
    // idempotency key. If the winning transaction committed,
    // return its stored response.
    // -------------------------------------------------------
    if (
      error?.message ===
      "IDEMPOTENCY_KEY_ALREADY_USED"
      && idempotencyKey
    ) {
      const existing =
        await IdempotencyKey.findOne({
          userId:
            idempotencyUserId,
          route:
            idempotencyRoute,
          key: idempotencyKey,
        }).lean();

      if (existing) {
        if (
          existing.requestHash !==
          idempotencyRequestHash
        ) {
          return NextResponse.json(
            {
              success: false,
              message:
                "مفتاح Idempotency مستخدم مع طلب مختلف",
            },
            { status: 409 }
          );
        }

        if (
          existing.responseStatus !==
            202 &&
          existing.responseBody
        ) {
          return NextResponse.json(
            existing.responseBody,
            {
              status:
                existing.responseStatus,
            }
          );
        }

        return NextResponse.json(
          {
            success: false,
            message:
              "الطلب قيد التنفيذ حاليًا، أعد المحاولة بنفس مفتاح Idempotency",
          },
          { status: 409 }
        );
      }
    }

    console.error(
      "ORDERS POST:",
      error
    );

    if (error?.message === "NO_MARKET_LIQUIDITY") {
      return NextResponse.json(
        {
          success: false,
          message: "لم تعد هناك سيولة مقابلة كافية لتنفيذ أمر السوق. لم يتم خصم أي رصيد.",
        },
        { status: 409 }
      );
    }

    if (
      error?.message ===
      "INSUFFICIENT_AVAILABLE_BALANCE"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "الرصيد المتاح غير كافٍ",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر إنشاء أمر التداول",
      },
      { status: 500 }
    );
  }
}
