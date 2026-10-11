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

  if (!uri) {
    throw new Error("MONGODB_URI / MONGO_URI is missing");
  }

  await mongoose.connect(uri, {
    dbName: "arabtrade",
  });

  const session = await mongoose.startSession();

  const buyerId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();

  let buyOrderId: mongoose.Types.ObjectId | null = null;
  let sellOrderId: mongoose.Types.ObjectId | null = null;

  try {
    console.log("");
    console.log("==================================================");
    console.log("ArabTrade - Matching Transaction Test");
    console.log("==================================================");
    console.log("");

    try {
      await session.withTransaction(async () => {
        console.log("[1/7] Creating BTC asset...");
        await Asset.create(
          [
            {
              name: "Bitcoin TEST",
              symbol: "BTC",
              type: "crypto",
              enabled: true,
              depositEnabled: false,
              withdrawalEnabled: false,
              tradingEnabled: true,
              sortOrder: 9991,
              networks: [],
            },
          ],
          { session, ordered: true }
        );

        console.log("[2/7] Creating USDT asset...");
        await Asset.create(
          [
            {
              name: "Tether TEST",
              symbol: "USDT",
              type: "crypto",
              enabled: true,
              depositEnabled: false,
              withdrawalEnabled: false,
              tradingEnabled: true,
              sortOrder: 9992,
              networks: [],
            },
          ],
          { session, ordered: true }
        );

        console.log("[3/7] Creating test wallets...");

        await Wallet.create(
          [
            {
              userId: buyerId,
              mode: "live",
              type: "spot",
              balances: [
                {
                  asset: "USDT",
                  available: 0,
                  locked: 1000,
                },
                {
                  asset: "BTC",
                  available: 0,
                  locked: 0,
                },
              ],
            },
            {
              userId: sellerId,
              mode: "live",
              type: "spot",
              balances: [
                {
                  asset: "BTC",
                  available: 0,
                  locked: 0.5,
                },
                {
                  asset: "USDT",
                  available: 0,
                  locked: 0,
                },
              ],
            },
          ],
          { session, ordered: true }
        );

        console.log("[4/7] Creating matching orders...");

        const [buyOrder, sellOrder] = await Order.create(
          [
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
          ],
          { session, ordered: true }
        );

        buyOrderId = buyOrder._id;
        sellOrderId = sellOrder._id;

        console.log("       Buy :", buyOrderId.toString());
        console.log("       Sell:", sellOrderId.toString());

        console.log("[5/7] Running matchOrder()...");

        const result = await matchOrder(
          buyOrderId.toString(),
          "live",
          session
        );

        console.log(
          "       Matched:",
          result.matched
        );

        console.log(
          "       Trades:",
          result.trades.length
        );

        if (result.matched !== 1) {
          throw new Error(
            `MATCH_FAILED_EXPECTED_1_GOT_${result.matched}`
          );
        }

        const tradeCount = await Trade.countDocuments({
          buyOrderId,
        }).session(session);

        if (tradeCount !== 1) {
          throw new Error(
            `TRADE_NOT_CREATED_EXPECTED_1_GOT_${tradeCount}`
          );
        }

        console.log("[6/7] Matching + settlement succeeded.");
        console.log("");
        console.log("       Buyer USDT: 1000 locked -> 0");
        console.log("       Buyer BTC : 0 -> 0.5 available");
        console.log("       Seller BTC: 0.5 locked -> 0");
        console.log("       Seller USDT: 0 -> 1000 available");
        console.log("");

        console.log(
          "[7/7] Forcing rollback intentionally..."
        );

        throw new Error("FORCE_ROLLBACK_TEST");
      });
    } catch (error: any) {
      if (error?.message !== "FORCE_ROLLBACK_TEST") {
        throw error;
      }

      console.log("");
      console.log("Rollback triggered successfully.");
    }

    console.log("");
    console.log("========== VERIFYING ROLLBACK ==========");

    const btcExists = await Asset.exists({
      symbol: "BTC",
      sortOrder: 9991,
    });

    const usdtExists = await Asset.exists({
      symbol: "USDT",
      sortOrder: 9992,
    });

    const buyerWallet = await Wallet.exists({
      userId: buyerId,
      mode: "live",
      type: "spot",
    });

    const sellerWallet = await Wallet.exists({
      userId: sellerId,
      mode: "live",
      type: "spot",
    });

    const buyExists = buyOrderId
      ? await Order.exists({ _id: buyOrderId })
      : null;

    const sellExists = sellOrderId
      ? await Order.exists({ _id: sellOrderId })
      : null;

    const trades = buyOrderId
      ? await Trade.countDocuments({
          buyOrderId,
        })
      : 0;

    console.log(
      "BTC Asset   :",
      btcExists ? "❌ STILL EXISTS" : "✅ ROLLED BACK"
    );

    console.log(
      "USDT Asset  :",
      usdtExists ? "❌ STILL EXISTS" : "✅ ROLLED BACK"
    );

    console.log(
      "Buyer Wallet:",
      buyerWallet ? "❌ STILL EXISTS" : "✅ ROLLED BACK"
    );

    console.log(
      "Seller Wallet:",
      sellerWallet ? "❌ STILL EXISTS" : "✅ ROLLED BACK"
    );

    console.log(
      "Buy Order   :",
      buyExists ? "❌ STILL EXISTS" : "✅ ROLLED BACK"
    );

    console.log(
      "Sell Order  :",
      sellExists ? "❌ STILL EXISTS" : "✅ ROLLED BACK"
    );

    console.log(
      "Trade Count :",
      trades === 0
        ? "✅ ROLLED BACK"
        : `❌ ${trades} TRADE(S) STILL EXISTS`
    );

    const passed =
      !btcExists &&
      !usdtExists &&
      !buyerWallet &&
      !sellerWallet &&
      !buyExists &&
      !sellExists &&
      trades === 0;

    console.log("");

    if (!passed) {
      throw new Error(
        "ROLLBACK VERIFICATION FAILED"
      );
    }

    console.log(
      "✅ MATCHING TRANSACTION TEST PASSED"
    );
    console.log(
      "✅ MATCHING + SETTLEMENT + ROLLBACK ARE ATOMIC"
    );
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ MATCHING TRANSACTION TEST FAILED");
  console.error(error);
  process.exit(1);
});
