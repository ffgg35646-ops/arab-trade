import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const mongoose = await import("mongoose");

  const { connectDB } =
    await import("@/lib/mongodb");

  const User =
    (await import("@/models/User")).default;

  const Wallet =
    (await import("@/models/Wallet")).default;

  const Asset =
    (await import("@/models/Asset")).default;

  const Order =
    (await import("@/models/Order")).default;

  const Trade =
    (await import("@/models/Trade")).default;

  const PlatformSettings =
    (await import("@/models/PlatformSettings")).default;

  const { matchOrder } =
    await import("@/lib/matching-engine");

  await connectDB();

  const id = Date.now();

  let buyer: any;
  let seller: any;
  let oldFee: number | null = null;

  try {
    // Fee = 0.1%
    const settings =
      await PlatformSettings.findOneAndUpdate(
        { key: "global" },
        {
          $set: {
            "trading.defaultFeePercent": 0.1,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        }
      );

    oldFee = Number(
      settings?.trading?.defaultFeePercent ?? 0.1
    );

    await Asset.findOneAndUpdate(
      { symbol: "BTC" },
      {
        $set: {
          name: "Bitcoin",
          symbol: "BTC",
          type: "crypto",
          enabled: true,
          tradingEnabled: true,
          networks: [],
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    await Asset.findOneAndUpdate(
      { symbol: "USDT" },
      {
        $set: {
          name: "Tether",
          symbol: "USDT",
          type: "crypto",
          enabled: true,
          tradingEnabled: true,
          networks: [],
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    buyer = await User.create({
      name: "Fee Buyer",
      username: `feebuyer${id}`,
      email: `feebuyer${id}@example.com`,
      password: "Test123456",
      referralCode: `FB${id}`,
      role: "user",
      isActive: true,
    });

    seller = await User.create({
      name: "Fee Seller",
      username: `feeseller${id}`,
      email: `feeseller${id}@example.com`,
      password: "Test123456",
      referralCode: `FS${id}`,
      role: "user",
      isActive: true,
    });

    // Trade = 100 USDT
    // Buyer needs 100 + 0.1 fee = 100.1 locked
    await Wallet.create({
      userId: buyer._id,
      type: "spot",
      mode: "demo",
      balances: [
        {
          asset: "USDT",
          available: 0,
          locked: 100.1,
        },
        {
          asset: "BTC",
          available: 0,
          locked: 0,
        },
      ],
    });

    await Wallet.create({
      userId: seller._id,
      type: "spot",
      mode: "demo",
      balances: [
        {
          asset: "USDT",
          available: 0,
          locked: 0,
        },
        {
          asset: "BTC",
          available: 0,
          locked: 0.1,
        },
      ],
    });

    const buy = await Order.create({
      userId: buyer._id,
      mode: "demo",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      price: 1000,
      quantity: 0.1,
      quoteAmount: 100,
      status: "open",
    });

    const sell = await Order.create({
      userId: seller._id,
      mode: "demo",
      symbol: "BTCUSDT",
      side: "sell",
      type: "limit",
      price: 1000,
      quantity: 0.1,
      quoteAmount: 100,
      status: "open",
    });

    const session =
      await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const result = await matchOrder(
          String(buy._id),
          "demo",
          session
        );

        if (
          result.matched !== 1 ||
          result.trades.length !== 1
        ) {
          throw new Error(
            "EXPECTED_ONE_MATCH"
          );
        }
      });
    } finally {
      await session.endSession();
    }

    const trade =
      await Trade.findOne({
        buyOrderId: buy._id,
        sellOrderId: sell._id,
        mode: "demo",
      }).lean();

    const buyerWallet =
      await Wallet.findOne({
        userId: buyer._id,
        type: "spot",
        mode: "demo",
      }).lean();

    const sellerWallet =
      await Wallet.findOne({
        userId: seller._id,
        type: "spot",
        mode: "demo",
      }).lean();

    const buyerUSDT =
      buyerWallet?.balances?.find(
        (x: any) => x.asset === "USDT"
      );

    const buyerBTC =
      buyerWallet?.balances?.find(
        (x: any) => x.asset === "BTC"
      );

    const sellerUSDT =
      sellerWallet?.balances?.find(
        (x: any) => x.asset === "USDT"
      );

    const sellerBTC =
      sellerWallet?.balances?.find(
        (x: any) => x.asset === "BTC"
      );

    console.log("");
    console.log("===== FEES TEST =====");
    console.log("feeBuyer:", trade?.feeBuyer);
    console.log("feeSeller:", trade?.feeSeller);
    console.log(
      "Buyer USDT locked:",
      buyerUSDT?.locked
    );
    console.log(
      "Buyer BTC available:",
      buyerBTC?.available
    );
    console.log(
      "Seller USDT available:",
      sellerUSDT?.available
    );
    console.log(
      "Seller BTC locked:",
      sellerBTC?.locked
    );

    const pass =
      Number(trade?.feeBuyer) === 0.1 &&
      Number(trade?.feeSeller) === 0.1 &&
      Number(buyerUSDT?.locked) === 0 &&
      Number(buyerBTC?.available) === 0.1 &&
      Number(sellerUSDT?.available) === 99.9 &&
      Number(sellerBTC?.locked) === 0;

    if (!pass) {
      throw new Error("FEES_TEST_FAILED");
    }

    console.log("");
    console.log(
      "✅ FEES TEST PASSED"
    );

    await Trade.deleteMany({
      $or: [
        { buyOrderId: buy._id },
        { sellOrderId: sell._id },
      ],
    });

    await Order.deleteMany({
      _id: {
        $in: [buy._id, sell._id],
      },
    });
  } finally {
    if (buyer?._id) {
      await Wallet.deleteMany({
        userId: buyer._id,
      });
      await User.deleteOne({
        _id: buyer._id,
      });
    }

    if (seller?._id) {
      await Wallet.deleteMany({
        userId: seller._id,
      });
      await User.deleteOne({
        _id: seller._id,
      });
    }

    // لا نترك إعداد الرسوم عشوائيًا.
    if (oldFee !== null) {
      await PlatformSettings.updateOne(
        { key: "global" },
        {
          $set: {
            "trading.defaultFeePercent": oldFee,
          },
        }
      );
    }

    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error("❌ FEES TEST ERROR:", error);

  try {
    const mongoose = await import("mongoose");
    await mongoose.disconnect();
  } catch {}

  process.exit(1);
});
