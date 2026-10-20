import mongoose from "mongoose";
import Order from "@/models/Order";
import Trade from "@/models/Trade";
import Wallet from "@/models/Wallet";
import Asset from "@/models/Asset";
import Notification from "@/models/Notification";
import { calculateTradingFee } from "@/lib/fee-engine";
import PlatformSettings from "@/models/PlatformSettings";
import LedgerEntry from "@/models/LedgerEntry";

type Side = "buy" | "sell";
type Mode = "demo" | "live";

function splitSymbol(
  symbol: string,
  assets: any[]
) {
  const normalized = symbol.toUpperCase();

  const candidates = assets
    .map((a: any) =>
      String(a.symbol || "").toUpperCase()
    )
    .filter(Boolean)
    .sort(
      (a: string, b: string) =>
        b.length - a.length
    );

  for (const base of candidates) {
    if (!normalized.startsWith(base)) {
      continue;
    }

    const quote = normalized.slice(base.length);

    if (
      quote &&
      candidates.includes(quote) &&
      quote !== base
    ) {
      return {
        base,
        quote,
      };
    }
  }

  return null;
}

async function moveLockedToAvailable(
  userId: mongoose.Types.ObjectId,
  asset: string,
  amount: number,
  mode: Mode = "live",
  session?: mongoose.ClientSession
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const result = await Wallet.updateOne(
    {
      userId,
      type: "spot",
      mode,
      balances: {
        $elemMatch: {
          asset,
          locked: {
            $gte: amount,
          },
        },
      },
    },
    {
      $inc: {
        "balances.$.locked": -amount,
        "balances.$.available": amount,
      },
    },
    { session }
  );

  if (result.modifiedCount !== 1) {
    throw new Error(
      "LOCKED_BALANCE_NOT_FOUND"
    );
  }
}

async function debitLocked(
  userId: mongoose.Types.ObjectId,
  asset: string,
  amount: number,
  mode: Mode = "live",
  session?: mongoose.ClientSession
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const result = await Wallet.updateOne(
    {
      userId,
      type: "spot",
      mode,
      balances: {
        $elemMatch: {
          asset,
          locked: {
            $gte: amount,
          },
        },
      },
    },
    {
      $inc: {
        "balances.$.locked": -amount,
      },
    },
    { session }
  );

  if (result.modifiedCount !== 1) {
    throw new Error(
      "INSUFFICIENT_LOCKED_BALANCE"
    );
  }
}

async function creditAvailable(
  userId: mongoose.Types.ObjectId,
  asset: string,
  amount: number,
  mode: Mode = "live",
  session?: mongoose.ClientSession
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const result = await Wallet.updateOne(
    {
      userId,
      type: "spot",
      mode,
      "balances.asset": asset,
    },
    {
      $inc: {
        "balances.$.available": amount,
      },
    },
    { session }
  );

  if (result.modifiedCount === 1) {
    return;
  }

  await Wallet.updateOne(
    {
      userId,
      type: "spot",
      mode,
    },
    {
      $push: {
        balances: {
          asset,
          available: amount,
          locked: 0,
        },
      },
    },
    { session }
  );
}

async function getAvailableBalance(
  userId: mongoose.Types.ObjectId,
  asset: string,
  mode: Mode,
  session?: mongoose.ClientSession
) {
  const wallet =
    await Wallet.findOne({
      userId,
      type: "spot",
      mode,
      "balances.asset": asset,
    })
      .session(session ?? null)
      .lean();

  const balance =
    wallet?.balances?.find(
      (x: any) =>
        String(x.asset).toUpperCase() ===
        asset.toUpperCase()
    );

  return Number(
    balance?.available || 0
  );
}

async function createLedgerEntry(
  userId: mongoose.Types.ObjectId,
  asset: string,
  mode: Mode,
  type: "trade" | "fee",
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  referenceId: string,
  note: string,
  session?: mongoose.ClientSession
) {
  await LedgerEntry.create(
    [
      {
        userId,
        scope: "user",
        asset,
        mode,
        type,
        amount: Number(amount.toFixed(12)),
        balanceBefore:
          Number(balanceBefore.toFixed(12)),
        balanceAfter:
          Number(balanceAfter.toFixed(12)),
        referenceId,
        note,
      },
    ],
    {
      session,
    }
  );
}

async function createSystemFeeLedger(
  asset: string,
  mode: Mode,
  amount: number,
  referenceId: string,
  note: string,
  session?: mongoose.ClientSession
) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return;
  }

  const previous =
    await LedgerEntry.findOne({
      scope: "system",
      systemAccount: "trading-fees",
      asset,
      mode,
    })
      .sort({
        createdAt: -1,
      })
      .session(session ?? null)
      .lean();

  const before =
    Number(
      previous?.balanceAfter || 0
    );

  const after =
    Number(
      (before + amount).toFixed(12)
    );

  await LedgerEntry.create(
    [
      {
        scope: "system",
        systemAccount: "trading-fees",
        asset,
        mode,
        type: "fee",
        amount:
          Number(amount.toFixed(12)),
        balanceBefore:
          Number(before.toFixed(12)),
        balanceAfter:
          after,
        referenceId,
        note,
      },
    ],
    {
      session,
    }
  );
}

async function notify(
  userId: mongoose.Types.ObjectId,
  title: string,
  message: string,
  session?: mongoose.ClientSession
) {
  await Notification.create(
    [
      {
        userId,
        type: "trade",
        title,
        message,
        read: false,
      },
    ],
    { session }
  );
}

function normalizeProgress(
  order: any
) {
  let remaining = Number(
    order.quantity || 0
  );

  if (
    !Number.isFinite(remaining) ||
    remaining < 0
  ) {
    remaining = 0;
  }

  let filled = Number(
    order.filledQuantity || 0
  );

  if (
    !Number.isFinite(filled) ||
    filled < 0
  ) {
    filled = 0;
  }

  let original = Number(
    order.originalQuantity
  );

  if (
    !Number.isFinite(original) ||
    original < remaining + filled
  ) {
    original = remaining + filled;
  }

  order.originalQuantity = original;
  order.filledQuantity = filled;
  order.quantity = remaining;

  return {
    remaining,
    filled,
    original,
  };
}

export async function matchOrder(
  orderId: string,
  mode: Mode = "live",
  session?: mongoose.ClientSession
) {
  const order = await Order.findOne({
    _id: orderId,
    mode,
  }).session(session || null);

  if (!order) {
    throw new Error(
      "ORDER_NOT_FOUND"
    );
  }

  if (order.status !== "open") {
    return {
      matched: 0,
      trades: [],
    };
  }

  if (
    order.type !== "limit" &&
    order.type !== "market"
  ) {
    return {
      matched: 0,
      trades: [],
    };
  }

  const assets = await Asset.find({
    enabled: true,
  })
    .lean()
    .session(session || null);

  const pair = splitSymbol(
    order.symbol,
    assets
  );

  if (!pair) {
    throw new Error(
      "PAIR_NOT_SUPPORTED"
    );
  }

  normalizeProgress(order);

  const oppositeSide: Side =
    order.side === "buy"
      ? "sell"
      : "buy";

  const sort =
    oppositeSide === "sell"
      ? {
          price: 1,
          createdAt: 1,
        }
      : {
          price: -1,
          createdAt: 1,
        };

  const counters = await Order.find({
    symbol: order.symbol,
    mode,
    side: oppositeSide,
    type: "limit",
    status: "open",
    userId: {
      $ne: order.userId,
    },
  })
    .sort({ price: sort.price as 1 | -1, createdAt: sort.createdAt as 1 | -1 })
    .session(session || null);

  let remaining = Number(
    order.quantity
  );

  let matched = 0;

  const trades: any[] = [];

  const platformSettings =
    await PlatformSettings.findOne({
      key: "global",
    })
      .session(session ?? null)
      .lean();

  const feePercent =
    Number(
      platformSettings?.trading?.defaultFeePercent ?? 0
    );

  if (
    !Number.isFinite(feePercent) ||
    feePercent < 0
  ) {
    throw new Error(
      "INVALID_TRADING_FEE_PERCENT"
    );
  }

  for (const counter of counters) {
    if (remaining <= 0) {
      break;
    }

    if (counter.status !== "open") {
      continue;
    }

    normalizeProgress(counter);

    const ownPrice =
      Number(order.price);

    const counterPrice =
      Number(counter.price);

    const crosses =
      order.type === "market"
        ? true
        : order.side === "buy"
          ? ownPrice >= counterPrice
          : ownPrice <= counterPrice;

    if (!crosses) {
      break;
    }

    const counterQty =
      Number(counter.quantity);

    const fillQty = Math.min(
      remaining,
      counterQty
    );

    if (
      !Number.isFinite(fillQty) ||
      fillQty <= 0
    ) {
      continue;
    }

    const executionPrice =
      counterPrice;

    const quoteAmount =
      fillQty * executionPrice;

    const buyerFee =
      calculateTradingFee(
        quoteAmount,
        feePercent
      );

    const sellerFee =
      calculateTradingFee(
        quoteAmount,
        feePercent
      );

    const buyerDebit =
      quoteAmount +
      buyerFee;

    const sellerCredit =
      Math.max(
        0,
        quoteAmount -
          sellerFee
      );

    const buyerId =
      order.side === "buy"
        ? order.userId
        : counter.userId;

    const sellerId =
      order.side === "sell"
        ? order.userId
        : counter.userId;

    const buyerQuoteBefore =
      await getAvailableBalance(
        buyerId,
        pair.quote,
        mode,
        session
      );

    const sellerQuoteBefore =
      await getAvailableBalance(
        sellerId,
        pair.quote,
        mode,
        session
      );

    const buyerBaseBefore =
      await getAvailableBalance(
        buyerId,
        pair.base,
        mode,
        session
      );

    const sellerBaseBefore =
      await getAvailableBalance(
        sellerId,
        pair.base,
        mode,
        session
      );

    if (order.side === "buy") {
      if (order.type === "market") {
        const reserveResult =
          await Wallet.findOneAndUpdate(
            {
              userId: order.userId,
              type: "spot",
              mode,
              balances: {
                $elemMatch: {
                  asset: pair.quote,
                  available: {
                    $gte: buyerDebit,
                  },
                },
              },
            },
            {
              $inc: {
                "balances.$.available":
                  -buyerDebit,
                "balances.$.locked":
                  buyerDebit,
              },
            },
            {
              new: true,
              session,
            }
          );

        if (!reserveResult) {
          throw new Error(
            "INSUFFICIENT_AVAILABLE_BALANCE"
          );
        }
      }

      await debitLocked(
        order.userId,
        pair.quote,
        buyerDebit,
        mode,
        session
      );

      await debitLocked(
        counter.userId,
        pair.base,
        fillQty,
        mode,
        session
      );
    } else {
      if (order.type === "market") {
        const reserveResult = await Wallet.findOneAndUpdate(
          {
            userId: order.userId,
            type: "spot",
            mode,
            balances: {
              $elemMatch: {
                asset: pair.base,
                available: { $gte: fillQty },
              },
            },
          },
          {
            $inc: {
              "balances.$.available": -fillQty,
              "balances.$.locked": fillQty,
            },
          },
          { new: true, session }
        );

        if (!reserveResult) {
          throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");
        }
      }

      await debitLocked(
        order.userId,
        pair.base,
        fillQty,
        mode,
        session
      );

      await debitLocked(
        counter.userId,
        pair.quote,
        buyerDebit,
        mode,
        session
      );
    }

    await creditAvailable(
      buyerId,
      pair.base,
      fillQty,
      mode,
      session
    );

    await creditAvailable(
      sellerId,
      pair.quote,
      sellerCredit,
      mode,
      session
    );

    const [trade] =
      await Trade.create(
        [
          {
            mode,
            symbol: order.symbol,

            buyOrderId:
              order.side === "buy"
                ? order._id
                : counter._id,

            sellOrderId:
              order.side === "sell"
                ? order._id
                : counter._id,

            buyerId,
            sellerId,

            price: executionPrice,
            quantity: fillQty,
            quoteAmount,

            feeBuyer:
              buyerFee,
            feeSeller:
              sellerFee,

            buyerFeeAsset:
              pair.quote,

            sellerFeeAsset:
              pair.quote,
          },
        ],
        { session }
      );

    const referenceId =
      `TRADE:${order._id}:${counter._id}`;

    // Buyer base: +quantity
    await createLedgerEntry(
      buyerId,
      pair.base,
      mode,
      "trade",
      fillQty,
      buyerBaseBefore,
      buyerBaseBefore + fillQty,
      referenceId,
      "Spot trade received",
      session
    );

    // Seller base: -quantity
    await createLedgerEntry(
      sellerId,
      pair.base,
      mode,
      "trade",
      -fillQty,
      sellerBaseBefore,
      sellerBaseBefore - fillQty,
      referenceId,
      "Spot trade sold",
      session
    );

    // Buyer quote: trade debit
    const buyerQuoteAfterTrade =
      buyerQuoteBefore -
      quoteAmount;

    await createLedgerEntry(
      buyerId,
      pair.quote,
      mode,
      "trade",
      -quoteAmount,
      buyerQuoteBefore,
      buyerQuoteAfterTrade,
      referenceId,
      "Spot trade payment",
      session
    );

    // Buyer quote: fee debit
    const buyerQuoteAfterFee =
      buyerQuoteAfterTrade -
      buyerFee;

    if (buyerFee > 0) {
      await createLedgerEntry(
        buyerId,
        pair.quote,
        mode,
        "fee",
        -buyerFee,
        buyerQuoteAfterTrade,
        buyerQuoteAfterFee,
        referenceId,
        "Spot trading fee",
        session
      );
    }

    // Seller quote: trade credit
    const sellerQuoteAfterTrade =
      sellerQuoteBefore +
      quoteAmount;

    await createLedgerEntry(
      sellerId,
      pair.quote,
      mode,
      "trade",
      quoteAmount,
      sellerQuoteBefore,
      sellerQuoteAfterTrade,
      referenceId,
      "Spot trade proceeds",
      session
    );

    // Seller quote: fee debit
    const sellerQuoteAfterFee =
      sellerQuoteAfterTrade -
      sellerFee;

    if (sellerFee > 0) {
      await createLedgerEntry(
        sellerId,
        pair.quote,
        mode,
        "fee",
        -sellerFee,
        sellerQuoteAfterTrade,
        sellerQuoteAfterFee,
        referenceId,
        "Spot trading fee",
        session
      );
    }

    // System receives both fees
    await createSystemFeeLedger(
      pair.quote,
      mode,
      buyerFee + sellerFee,
      referenceId,
      "Trading fees collected",
      session
    );

    remaining = Math.max(
      0,
      remaining - fillQty
    );

    order.quantity = remaining;

    order.filledQuantity =
      Number(
        order.filledQuantity || 0
      ) + fillQty;

    if (
      !Number.isFinite(
        Number(order.originalQuantity)
      )
    ) {
      order.originalQuantity =
        remaining +
        Number(
          order.filledQuantity || 0
        );
    }

    order.status =
      remaining <= 0
        ? "filled"
        : "open";

    counter.quantity =
      Math.max(
        0,
        counterQty - fillQty
      );

    counter.filledQuantity =
      Number(
        counter.filledQuantity || 0
      ) + fillQty;

    if (
      !Number.isFinite(
        Number(counter.originalQuantity)
      )
    ) {
      counter.originalQuantity =
        Number(counter.quantity) +
        Number(
          counter.filledQuantity || 0
        );
    }

    counter.status =
      counter.quantity <= 0
        ? "filled"
        : "open";

    await order.save({
      session,
    });

    await counter.save({
      session,
    });

    await notify(
      buyerId,
      "تم تنفيذ صفقة",
      `تم شراء ${fillQty} ${pair.base} بسعر ${executionPrice} ${pair.quote}`,
      session
    );

    await notify(
      sellerId,
      "تم تنفيذ صفقة",
      `تم بيع ${fillQty} ${pair.base} بسعر ${executionPrice} ${pair.quote}`,
      session
    );

    trades.push(trade);

    matched += 1;
  }

  // A market order must never remain open after consuming available liquidity.
  // Any unfilled remainder was not reserved and is marked cancelled.
  if (order.type === "market" && remaining > 0 && matched > 0) {
    order.status = "cancelled";
    await order.save({ session });
  }

  return {
    matched,
    trades,
  };
}

export async function releaseOrderLock(
  orderId: string
) {
  const order =
    await Order.findById(
      orderId
    );

  if (!order) {
    throw new Error(
      "ORDER_NOT_FOUND"
    );
  }

  if (
    order.status !== "cancelled"
  ) {
    return;
  }

  const remaining =
    Math.max(
      0,
      Number(
        order.quantity || 0
      )
    );

  if (remaining <= 0) {
    return;
  }

  const assets =
    await Asset.find({
      enabled: true,
    }).lean();

  const pair =
    splitSymbol(
      order.symbol,
      assets
    );

  if (!pair) {
    throw new Error(
      "PAIR_NOT_SUPPORTED"
    );
  }

  const remainingQuote =
    remaining *
    Number(order.price);

  const platformSettings =
    await PlatformSettings.findOne({
      key: "global",
    }).lean();

  const currentFeePercent =
    Number(
      platformSettings?.trading
        ?.defaultFeePercent ?? 0
    );

  const remainingFee =
    order.side === "buy"
      ? calculateTradingFee(
          remainingQuote,
          currentFeePercent
        )
      : 0;

  const amount =
    order.side === "buy"
      ? remainingQuote +
        remainingFee
      : remaining;

  const asset =
    order.side === "buy"
      ? pair.quote
      : pair.base;

  await moveLockedToAvailable(
    order.userId,
    asset,
    amount,
    order.mode || "live"
  );
}
