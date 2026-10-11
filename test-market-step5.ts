import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const mongoose = await import("mongoose");
  const { connectDB } = await import("@/lib/mongodb");
  const User = (await import("@/models/User")).default;
  const Wallet = (await import("@/models/Wallet")).default;
  const Order = (await import("@/models/Order")).default;
  const Trade = (await import("@/models/Trade")).default;
  const Asset = (await import("@/models/Asset")).default;
  const { matchOrder } = await import("@/lib/matching-engine");

  await connectDB();

  const id = Date.now();
  let buyer: any = null;
  let seller: any = null;

  try {
    buyer = await User.create({
      name: "Market Buyer",
      username: `mb${id}`,
      email: `mb${id}@example.com`,
      password: "Test123456",
      referralCode: `MB${id}`,
      role: "user",
      isActive: true,
    });

    seller = await User.create({
      name: "Market Seller",
      username: `ms${id}`,
      email: `ms${id}@example.com`,
      password: "Test123456",
      referralCode: `MS${id}`,
      role: "user",
      isActive: true,
    });

    for (const asset of [
      {
        symbol: "BTC",
        name: "Bitcoin",
      },
      {
        symbol: "USDT",
        name: "Tether",
      },
    ]) {
      await Asset.findOneAndUpdate(
        { symbol: asset.symbol },
        {
          $set: {
            name: asset.name,
            symbol: asset.symbol,
            type: "crypto",
            enabled: true,
            tradingEnabled: true,
            networks: [],
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        }
      );
    }

    await Wallet.create({
      userId: buyer._id,
      type: "spot",
      mode: "demo",
      balances: [
        {
          asset: "USDT",
          available: 1000,
          locked: 0,
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
          available: 1,
          locked: 0.1,
        },
      ],
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
      originalQuantity: 0.1,
      filledQuantity: 0,
      status: "open",
    });

    const marketBuy = await Order.create({
      userId: buyer._id,
      mode: "demo",
      symbol: "BTCUSDT",
      side: "buy",
      type: "market",
      price: 0,
      quantity: 0.1,
      quoteAmount: 0,
      originalQuantity: 0.1,
      filledQuantity: 0,
      status: "open",
    });

    const session =
      await mongoose.startSession();

    try {
      await session.withTransaction(
        async () => {
          const result =
            await matchOrder(
              String(marketBuy._id),
              "demo",
              session
            );

          if (
            result.matched !== 1
          ) {
            throw new Error(
              "MARKET_EXPECTED_ONE_MATCH"
            );
          }
        }
      );
    } finally {
      await session.endSession();
    }

    const trade =
      await Trade.findOne({
        buyOrderId:
          marketBuy._id,
        sellOrderId:
          sell._id,
        mode: "demo",
      }).lean();

    console.log("");
    console.log(
      "===== MARKET STEP 5 TEST ====="
    );
    console.log(
      "Trade price:",
      trade?.price
    );
    console.log(
      "Trade quantity:",
      trade?.quantity
    );
    console.log(
      "Buyer fee:",
      trade?.feeBuyer
    );
    console.log(
      "Seller fee:",
      trade?.feeSeller
    );

    if (
      Number(trade?.price) !== 1000 ||
      Number(trade?.quantity) !== 0.1
    ) {
      throw new Error(
        "MARKET_TEST_FAILED"
      );
    }

    console.log("");
    console.log(
      "✅ MARKET ORDER TEST PASSED"
    );
  } finally {
    if (buyer?._id && seller?._id) {
      await Trade.deleteMany({
        $or: [
          {
            buyerId:
              buyer._id,
          },
          {
            sellerId:
              seller._id,
          },
        ],
      });

      await Order.deleteMany({
        $or: [
          {
            userId:
              buyer._id,
          },
          {
            userId:
              seller._id,
          },
        ],
      });

      await Wallet.deleteMany({
        $or: [
          {
            userId:
              buyer._id,
          },
          {
            userId:
              seller._id,
          },
        ],
      });

      await User.deleteMany({
        _id: {
          $in: [
            buyer._id,
            seller._id,
          ],
        },
      });
    }

    await mongoose.disconnect();
  }
}

main().catch(
  async (error) => {
    console.error(
      "❌ MARKET TEST ERROR:",
      error
    );

    try {
      const mongoose =
        await import("mongoose");
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
);
