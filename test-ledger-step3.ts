import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const mongoose = await import("mongoose");
  const { connectDB } = await import("@/lib/mongodb");

  const User = (await import("@/models/User")).default;
  const Wallet = (await import("@/models/Wallet")).default;
  const Asset = (await import("@/models/Asset")).default;
  const Order = (await import("@/models/Order")).default;
  const Trade = (await import("@/models/Trade")).default;
  const LedgerEntry = (await import("@/models/LedgerEntry")).default;
  const PlatformSettings =
    (await import("@/models/PlatformSettings")).default;

  const { matchOrder } =
    await import("@/lib/matching-engine");

  await connectDB();

  const id = Date.now();
  let buyer: any;
  let seller: any;

  try {
    await PlatformSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { "trading.defaultFeePercent": 0.1 } },
      { upsert: true, returnDocument: "after" }
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
      name: "Ledger Buyer",
      username: `ledgerbuyer${id}`,
      email: `ledgerbuyer${id}@example.com`,
      password: "Test123456",
      referralCode: `LB${id}`,
      role: "user",
      isActive: true,
    });

    seller = await User.create({
      name: "Ledger Seller",
      username: `ledgerseller${id}`,
      email: `ledgerseller${id}@example.com`,
      password: "Test123456",
      referralCode: `LS${id}`,
      role: "user",
      isActive: true,
    });

    await Wallet.create({
      userId: buyer._id,
      type: "spot",
      mode: "demo",
      balances: [
        { asset: "USDT", available: 900, locked: 100.1 },
        { asset: "BTC", available: 0, locked: 0 },
      ],
    });

    await Wallet.create({
      userId: seller._id,
      type: "spot",
      mode: "demo",
      balances: [
        { asset: "USDT", available: 0, locked: 0 },
        { asset: "BTC", available: 0, locked: 0.1 },
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
      originalQuantity: 0.1,
      filledQuantity: 0,
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
      originalQuantity: 0.1,
      filledQuantity: 0,
      status: "open",
    });

    const session = await mongoose.startSession();

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
          throw new Error("EXPECTED_ONE_TRADE");
        }
      });
    } finally {
      await session.endSession();
    }

    const entries = await LedgerEntry.find({
      mode: "demo",
      referenceId: {
        $regex: `TRADE:${buy._id}:${sell._id}`,
      },
    }).lean();

    const userEntries = entries.filter(
      (x: any) => x.scope === "user"
    );

    const systemEntries = entries.filter(
      (x: any) =>
        x.scope === "system" &&
        x.systemAccount === "trading-fees"
    );

    console.log("");
    console.log("===== LEDGER STEP 3 TEST =====");
    console.log("Total entries:", entries.length);
    console.log("User entries:", userEntries.length);
    console.log("System fee entries:", systemEntries.length);

    for (const entry of entries) {
      console.log({
        scope: entry.scope,
        userId: entry.userId
          ? String(entry.userId)
          : undefined,
        systemAccount: entry.systemAccount,
        asset: entry.asset,
        mode: entry.mode,
        type: entry.type,
        amount: entry.amount,
      });
    }

    const tradeEntries = userEntries.filter(
      (x: any) => x.type === "trade"
    );

    const feeEntries = userEntries.filter(
      (x: any) => x.type === "fee"
    );

    const pass =
      tradeEntries.length === 4 &&
      feeEntries.length === 2 &&
      systemEntries.length === 1 &&
      systemEntries[0].amount === 0.2 &&
      entries.every(
        (x: any) => x.mode === "demo"
      );

    if (!pass) {
      throw new Error("LEDGER_STEP3_TEST_FAILED");
    }

    console.log("");
    console.log("✅ LEDGER STEP 3 TEST PASSED");
    console.log("✅ Demo ledger isolation works");
    console.log("✅ Trade debits/credits recorded");
    console.log("✅ Buyer/Seller fees recorded");
    console.log("✅ System fee account recorded");
  } finally {
    if (buyer?._id && seller?._id) {
      await LedgerEntry.deleteMany({
        $or: [
          { userId: buyer._id },
          { userId: seller._id },
        ],
      });

      await Trade.deleteMany({
        $or: [
          { buyerId: buyer._id },
          { sellerId: seller._id },
        ],
      });

      await Order.deleteMany({
        $or: [
          { userId: buyer._id },
          { userId: seller._id },
        ],
      });

      await Wallet.deleteMany({
        $or: [
          { userId: buyer._id },
          { userId: seller._id },
        ],
      });

      await User.deleteMany({
        _id: {
          $in: [buyer._id, seller._id],
        },
      });
    }

    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error("❌ LEDGER TEST ERROR:", error);

  try {
    const mongoose = await import("mongoose");
    await mongoose.disconnect();
  } catch {}

  process.exit(1);
});
