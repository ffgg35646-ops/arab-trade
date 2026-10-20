import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedIdentity } from "@/lib/require-kyc";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Wallet from "@/models/Wallet";
import Asset from "@/models/Asset";
import Notification from "@/models/Notification";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import { matchOrder } from "@/lib/matching-engine";
import { calculateTradingFee } from "@/lib/fee-engine";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import {
  getIdempotentResponse,
  hashRequest,
} from "@/lib/idempotency";
import IdempotencyKey from "@/models/IdempotencyKey";

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
    const kycGuard =
      await requireVerifiedIdentity(
        request
      );

    if (!kycGuard.ok) {
      return NextResponse.json(
        {
          success: false,
          message: kycGuard.message,
        },
        {
          status: kycGuard.status,
        }
      );
    }

    const user =
      await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مسجل الدخول",
        },
        { status: 401 }
      );
    }

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
  let session:
    mongoose.ClientSession | null =
    null;

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
    const identity = await requireVerifiedIdentity(request);
    if (!identity.ok) {
      return NextResponse.json(
        { success: false, message: identity.message },
        { status: identity.status }
      );
    }
    const user = identity.user;

    idempotencyUserId = user._id;

    await connectDB();
    await migrateLegacyDepositBalancesToSpotWallet(user._id);

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

    const body =
      await request
        .json()
        .catch(() => ({}));

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
      String(
        body.symbol || ""
      )
        .trim()
        .toUpperCase();

    const mode =
      String(
        body.mode || "live"
      )
        .trim()
        .toLowerCase() ===
      "demo"
        ? "demo"
        : "live";

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

    const estimatedFee =
      calculateTradingFee(
        quoteAmount,
        feePercent
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

    const assets =
      await Asset.find({
        enabled: true,
        tradingEnabled: true,
      })
        .select("symbol")
        .lean();

    const pair =
      splitPair(
        symbol,
        assets.map(
          (a) => a.symbol
        )
      );

    if (!pair) {
      return NextResponse.json(
        {
          success: false,
          message:
            "زوج التداول غير معروف",
        },
        { status: 400 }
      );
    }

    if (type === "market") {
      const oppositeSide = side === "buy" ? "sell" : "buy";
      const bestCounterOrder = await Order.findOne({
        symbol,
        mode,
        side: oppositeSide,
        type: "limit",
        status: "open",
        quantity: { $gt: 0 },
        userId: { $ne: user._id },
      })
        .sort({ price: side === "buy" ? 1 : -1, createdAt: 1 })
        .select("price")
        .lean();

      if (!bestCounterOrder || !(Number(bestCounterOrder.price) > 0)) {
        return NextResponse.json(
          {
            success: false,
            message: "لا توجد سيولة مقابلة حاليًا لتنفيذ أمر السوق. جرّب أمرًا محددًا أو أعد المحاولة لاحقًا.",
          },
          { status: 409 }
        );
      }

      // Price is informational for market orders; fills use each counter-order price.
      price = Number(bestCounterOrder.price);
    }

    session =
      await mongoose.startSession();

    let createdOrderId:
      mongoose.Types.ObjectId | null =
      null;

    let matchingResult: {
      matched: number;
      trades: unknown[];
    } = {
      matched: 0,
      trades: [],
    };

    let finalResponseBody:
      | Record<string, unknown>
      | null =
      null;

    let finalResponseStatus =
      201;

    await session.withTransaction(
      async () => {
        // -------------------------------------------------
        // Reserve idempotency key inside the SAME
        // transaction as wallet lock + order + matching.
        // -------------------------------------------------
        if (idempotencyKey) {
          try {
            await IdempotencyKey.create(
              [
                {
                  userId: user._id,
                  key: idempotencyKey,
                  route:
                    idempotencyRoute,
                  requestHash,
                  responseStatus:
                    202,
                  responseBody: {
                    success: true,
                    pending: true,
                  },
                },
              ],
              {
                session,
                ordered: true,
              }
            );
          } catch (error: any) {
            if (
              error?.code ===
              11000
            ) {
              throw new Error(
                "IDEMPOTENCY_KEY_ALREADY_USED"
              );
            }

            throw error;
          }
        }

        // -------------------------------------------------
        // Lock the required wallet balance.
        // -------------------------------------------------
        if (type === "market") {
          // Market orders are reserved by the matching engine
          // because their final execution value is unknown
          // until the available order-book levels are consumed.
        } else if (side === "buy") {
          const wallet =
            await Wallet.findOneAndUpdate(
              {
                userId: user._id,
                type: "spot",
                mode,
                balances: {
                  $elemMatch: {
                    asset: pair.quote,
                    available: {
                      $gte:
                        quoteAmount +
                        estimatedFee,
                    },
                  },
                },
              },
              {
                $inc: {
                  "balances.$.available":
                    -(
                      quoteAmount +
                      estimatedFee
                    ),
                  "balances.$.locked":
                    quoteAmount +
                    estimatedFee,
                },
              },
              {
                new: true,
                session,
              }
            );

          if (!wallet) {
            throw new Error(
              "INSUFFICIENT_AVAILABLE_BALANCE"
            );
          }
        } else {
          const wallet =
            await Wallet.findOneAndUpdate(
              {
                userId: user._id,
                type: "spot",
                mode,
                balances: {
                  $elemMatch: {
                    asset: pair.base,
                    available: {
                      $gte:
                        quantity,
                    },
                  },
                },
              },
              {
                $inc: {
                  "balances.$.available":
                    -quantity,
                  "balances.$.locked":
                    quantity,
                },
              },
              {
                new: true,
                session,
              }
            );

          if (!wallet) {
            throw new Error(
              "INSUFFICIENT_AVAILABLE_BALANCE"
            );
          }
        }

        // -------------------------------------------------
        // Create order inside same transaction.
        // -------------------------------------------------
        const [order] =
          await Order.create(
            [
              {
                userId: user._id,
                mode,
                symbol,
                side,
                type,
                price,
                quantity,
                quoteAmount,
                originalQuantity:
                  quantity,
                filledQuantity: 0,
                status: "open",
              },
            ],
            { session }
          );

        createdOrderId =
          order._id;

        // -------------------------------------------------
        // Matching + settlement happen in same transaction.
        // -------------------------------------------------
        matchingResult =
          await matchOrder(
            String(order._id),
            mode,
            session ?? undefined
          );

        if (type === "market" && matchingResult.matched <= 0) {
          throw new Error("NO_MARKET_LIQUIDITY");
        }

        // -------------------------------------------------
        // Read final order INSIDE transaction so the saved
        // idempotency response is exactly what was committed.
        // -------------------------------------------------
        const latestOrder =
          await Order.findById(
            createdOrderId
          )
            .session(session)
            .lean();

        if (!latestOrder) {
          throw new Error(
            "ORDER_NOT_FOUND_AFTER_CREATE"
          );
        }

        finalResponseBody = {
          success: true,
          message:
            matchingResult.matched > 0
              ? "تم إنشاء الأمر وتنفيذ المطابقات المتاحة"
              : "تم إنشاء الأمر",
          order: latestOrder,
          matching: {
            matched:
              matchingResult.matched,
            trades:
              matchingResult.trades,
          },
        };

        // -------------------------------------------------
        // Store FINAL idempotency response inside same txn.
        // -------------------------------------------------
        if (idempotencyKey) {
          await IdempotencyKey.updateOne(
            {
              userId: user._id,
              route:
                idempotencyRoute,
              key: idempotencyKey,
            },
            {
              $set: {
                responseStatus:
                  finalResponseStatus,
                responseBody:
                  finalResponseBody,
              },
            },
            {
              session: session ?? undefined,
            }
          );
        }
      }
    );

    if (!createdOrderId) {
      throw new Error(
        "ORDER_CREATION_FAILED"
      );
    }

    if (!finalResponseBody) {
      throw new Error(
        "ORDER_RESPONSE_BUILD_FAILED"
      );
    }

    // -----------------------------------------------------
    // Notification is intentionally outside the transaction.
    // Failure here must NOT undo the committed trade.
    // -----------------------------------------------------
    try {
      await Notification.create({
        userId: user._id,
        type: "trade",
        title:
          matchingResult.matched > 0
            ? "تم تنفيذ جزء من أمر التداول"
            : "تم إنشاء أمر تداول",
        message:
          matchingResult.matched > 0
            ? `تم تنفيذ ${matchingResult.matched} مطابقة على ${symbol}.`
            : `تم إنشاء أمر ${
                side === "buy"
                  ? "شراء"
                  : "بيع"
              } على ${symbol} بقيمة ${quoteAmount}.`,
        read: false,
      });
    } catch (notificationError) {
      console.error(
        "ORDER NOTIFICATION:",
        notificationError
      );
    }

    return NextResponse.json(
      finalResponseBody,
      { status: finalResponseStatus }
    );
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
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}
