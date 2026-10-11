// @ts-nocheck -- legacy integration fixture; runtime assertions remain executable.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { connectDB } = await import("@/lib/mongodb");
  const mongoose = (await import("mongoose")).default;

  const User = (await import("@/models/User")).default;
  const Wallet = (await import("@/models/Wallet")).default;
  const Order = (await import("@/models/Order")).default;
  const Trade = (await import("@/models/Trade")).default;
  const Asset = (await import("@/models/Asset")).default;
  const TradingPair = mongoose.models.TradingPair
    ?? (await import("@/models/TradingPair")).default;

  const { matchOrder } = await import("@/lib/matching-engine");

  await connectDB();

  console.log("\n===== LIVE SPOT E2E =====");

  const pair = await TradingPair.findOne({
    symbol: "BTCUSDT",
    status: "TRADING",
    spotTradingEnabled: true,
  }).lean();

  if (!pair) {
    throw new Error("BTCUSDT_PAIR_NOT_ACTIVE");
  }

  const btc = await Asset.findOne({ symbol: "BTC" }).lean();
  const usdt = await Asset.findOne({ symbol: "USDT" }).lean();

  if (!btc || !usdt) {
    throw new Error("BTC_USDT_ASSETS_MISSING");
  }

  const tag = Date.now().toString();

  const seller = await User.create({
    name: "Live Seller",
    username: `sell${tag.slice(-10)}`,
    email: `seller-${tag}@example.test`,
    password: "LiveTest123!",
    referralCode: `SELL${tag.slice(-8)}`,
    role: "user",
    isActive: true,
    isVerified: true,
  });

  const buyer = await User.create({
    name: "Live Buyer",
    username: `buy${tag.slice(-10)}`,
    email: `buyer-${tag}@example.test`,
    password: "LiveTest123!",
    referralCode: `BUY${tag.slice(-8)}`,
    role: "user",
    isActive: true,
    isVerified: true,
  });

  const sellerWallet = await Wallet.create({
    userId: seller._id,
    mode: "live",
    type: "spot",
    balances: [
      { asset: "BTC", available: 1, locked: 0 },
      { asset: "USDT", available: 0, locked: 0 },
    ],
  });

  const buyerWallet = await Wallet.create({
    userId: buyer._id,
    mode: "live",
    type: "spot",
    balances: [
      { asset: "BTC", available: 0, locked: 0 },
      { asset: "USDT", available: 100000, locked: 0 },
    ],
  });

  const session = await mongoose.startSession();

  let sellId = "";
  let buyId = "";

  try {
    await session.withTransaction(async () => {
      const sell = await Order.create(
        [{
          userId: seller._id,
          mode: "live",
          symbol: "BTCUSDT",
          side: "sell",
          type: "limit",
          price: 50000,
          quantity: 0.01,
          originalQuantity: 0.01,
          filledQuantity: 0,
          remainingQuantity: 0.01,
          quoteAmount: 500,
          status: "open",
        }],
        { session }
      );

      sellId = String(sell[0]._id);

      await Wallet.updateOne(
        {
          _id: sellerWallet._id,
          "balances.asset": "BTC",
        },
        {
          $inc: {
            "balances.$.available": -0.01,
            "balances.$.locked": 0.01,
          },
        },
        { session }
      );

      const buy = await Order.create(
        [{
          userId: buyer._id,
          mode: "live",
          symbol: "BTCUSDT",
          side: "buy",
          type: "limit",
          price: 50000,
          quantity: 0.01,
          originalQuantity: 0.01,
          filledQuantity: 0,
          remainingQuantity: 0.01,
          quoteAmount: 500,
          status: "open",
        }],
        { session }
      );

      buyId = String(buy[0]._id);

      await Wallet.updateOne(
        {
          _id: buyerWallet._id,
          "balances.asset": "USDT",
        },
        {
          $inc: {
            "balances.$.available": -500.5,
            "balances.$.locked": 500.5,
          },
        },
        { session }
      );

      await matchOrder(buy[0]._id, "live", session);
    });
  } finally {
    await session.endSession();
  }

  const sellAfter = await Order.findById(sellId).lean();
  const buyAfter = await Order.findById(buyId).lean();

  const trade = await Trade.findOne({
    $or: [
      { buyOrderId: buyId },
      { sellOrderId: sellId },
    ],
  }).sort({ createdAt: -1 }).lean();

  const sellerAfter = await Wallet.findById(sellerWallet._id).lean();
  const buyerAfter = await Wallet.findById(buyerWallet._id).lean();

  const getBalance = (wallet: any, asset: string) => {
    const row = wallet?.balances?.find((x: any) => x.asset === asset);
    return {
      available: Number(row?.available ?? 0),
      locked: Number(row?.locked ?? 0),
    };
  };

  console.log("\nOrders:");
  console.log("SELL:", sellAfter?.status, sellAfter?.filledQuantity);
  console.log("BUY :", buyAfter?.status, buyAfter?.filledQuantity);

  console.log("\nTrade:");
  console.log(
    JSON.stringify(
      trade
        ? {
            id: String(trade._id),
            symbol: trade.symbol,
            price: trade.price,
            quantity: trade.quantity,
          }
        : null,
      null,
      2
    )
  );

  console.log("\nSeller BTC:");
  console.log(getBalance(sellerAfter, "BTC"));

  console.log("\nBuyer BTC:");
  console.log(getBalance(buyerAfter, "BTC"));

  console.log("\nBuyer USDT:");
  console.log(getBalance(buyerAfter, "USDT"));

  const success =
    sellAfter?.status === "filled" &&
    buyAfter?.status === "filled" &&
    !!trade &&
    Number(trade.quantity) === 0.01 &&
    getBalance(sellerAfter, "BTC").available === 0.99 &&
    getBalance(buyerAfter, "BTC").available > 0 &&
    getBalance(buyerAfter, "USDT").available < 100000;

  if (!success) {
    throw new Error("LIVE_SPOT_E2E_FAILED");
  }

  await Trade.deleteMany({
    $or: [
      { buyOrderId: buyId },
      { sellOrderId: sellId },
    ],
  });

  await Order.deleteMany({
    _id: {
      $in: [sellId, buyId],
    },
  });

  await Wallet.deleteMany({
    _id: {
      $in: [sellerWallet._id, buyerWallet._id],
    },
  });

  await User.deleteMany({
    _id: {
      $in: [seller._id, buyer._id],
    },
  });

  console.log("\n✅ LIVE SPOT E2E PASSED");
  console.log("✅ Buyer + Seller matched");
  console.log("✅ Live wallets changed");
  console.log("✅ Live trade created");
  console.log("✅ Test data cleaned");

  process.exit(0);
}

main().catch((error) => {
  console.error("\n❌ LIVE SPOT E2E FAILED\n", error);
  process.exit(1);
});
