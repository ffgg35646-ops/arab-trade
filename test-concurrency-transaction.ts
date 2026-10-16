import mongoose from "mongoose";
import { loadEnvConfig } from "@next/env";

import Asset from "./models/Asset";
import Wallet from "./models/Wallet";
import Order from "./models/Order";
import Trade from "./models/Trade";
import { matchOrder } from "./lib/matching-engine";

loadEnvConfig(process.cwd());

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI / MONGO_URI is missing");

  await mongoose.connect(uri, { dbName: "arabtrade" });

  const buyerId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await Asset.create([
        {
          name: "Bitcoin TEST",
          symbol: "BTC",
          type: "crypto",
          enabled: true,
          depositEnabled: false,
          tradingEnabled: true,
          sortOrder: 9991,
          networks: [],
        },
        {
          name: "Tether TEST",
          symbol: "USDT",
          type: "crypto",
          enabled: true,
          depositEnabled: false,
          tradingEnabled: true,
          sortOrder: 9992,
          networks: [],
        },
      ], { session, ordered: true });

      await Wallet.create([
        {
          userId: buyerId,
          mode: "live",
          type: "spot",
          balances: [
            { asset: "USDT", available: 0, locked: 1000 },
            { asset: "BTC", available: 0, locked: 0 },
          ],
        },
        {
          userId: sellerId,
          mode: "live",
          type: "spot",
          balances: [
            { asset: "BTC", available: 0, locked: 0.5 },
            { asset: "USDT", available: 0, locked: 0 },
          ],
        },
      ], { session, ordered: true });

      const [buy] = await Order.create([
        {
          userId: buyerId,
          mode: "live",
          symbol: "BTCUSDT",
          side: "buy",
          type: "limit",
          price: 2000,
          quantity: 0.5,
          quoteAmount: 1000,
          originalQuantity: 0.5,
          filledQuantity: 0,
          status: "open",
        },
      ], { session, ordered: true });

      const [sell] = await Order.create([
        {
          userId: sellerId,
          mode: "live",
          symbol: "BTCUSDT",
          side: "sell",
          type: "limit",
          price: 2000,
          quantity: 0.5,
          quoteAmount: 1000,
          originalQuantity: 0.5,
          filledQuantity: 0,
          status: "open",
        },
      ], { session, ordered: true });

      console.log("==========================================");
      console.log("CONCURRENCY TEST");
      console.log("==========================================");
      console.log("Starting TWO simultaneous matchOrder() calls...");

      const results = await Promise.allSettled([
        matchOrder(buy._id.toString(), "live", session),
        matchOrder(buy._id.toString(), "live", session),
      ]);

      console.log("");
      console.log("Result 1:", results[0].status);
      console.log("Result 2:", results[1].status);

      const trades = await Trade.countDocuments({
        buyOrderId: buy._id,
      }).session(session);

      const freshBuy = await Order.findById(buy._id)
        .session(session);

      const freshSell = await Order.findById(sell._id)
        .session(session);

      console.log("Trades created:", trades);
      console.log("Buy status:", freshBuy?.status);
      console.log("Sell status:", freshSell?.status);

      if (trades > 1) {
        throw new Error(
          `DOUBLE_TRADE_DETECTED: ${trades}`
        );
      }

      if (
        freshBuy?.filledQuantity !== undefined &&
        Number(freshBuy.filledQuantity) > 0.5
      ) {
        throw new Error("DOUBLE_FILL_DETECTED");
      }

      console.log("");
      console.log("✅ NO DOUBLE TRADE DETECTED");
      console.log("Forcing rollback...");
      
      throw new Error("FORCE_ROLLBACK_TEST");
    });
  } catch (error: any) {
    if (error?.message !== "FORCE_ROLLBACK_TEST") {
      throw error;
    }

    console.log("✅ Rollback completed");
    console.log("✅ CONCURRENCY TEST PASSED");
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ CONCURRENCY TEST FAILED");
  console.error(error);
  process.exit(1);
});
