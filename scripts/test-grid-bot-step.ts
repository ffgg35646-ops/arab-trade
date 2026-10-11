
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { connectDB } =
    await import("@/lib/mongodb");

  const User =
    (await import("@/models/User")).default;

  const Asset =
    (await import("@/models/Asset")).default;

  const Wallet =
    (await import("@/models/Wallet")).default;

  const GridBot =
    (await import("@/models/GridBot")).default;

  const GridBotOrder =
    (await import("@/models/GridBotOrder")).default;

  const Order =
    (await import("@/models/Order")).default;

  const {
    createGridBot,
    startGridBot,
    syncGridOrders,
    runGridBotCycle,
  } = await import("@/lib/grid-bot");

  await connectDB();

  console.log("\n===== GRID BOT CYCLE TEST =====\n");

  const tag = `grid-test-${Date.now()}`;

  const user = await User.create({
    name: "Grid Test User",
    username: `grid${Date.now().toString().slice(-10)}`,
    email: `${tag}@example.test`,
    password: "GridTest123!",
    referralCode: `GRID${Date.now().toString().slice(-8)}`,
    role: "user",
    isActive: true,
    isVerified: true,
  });

  const usdt = await Asset.findOneAndUpdate(
    { symbol: "USDT" },
    {
      $setOnInsert: {
        symbol: "USDT",
        name: "Tether",
        type: "crypto",
        enabled: true,
        depositEnabled: true,
        withdrawalEnabled: true,
        tradingEnabled: true,
      },
    },
    { upsert: true, new: true }
  );

  const btc = await Asset.findOneAndUpdate(
    { symbol: "BTC" },
    {
      $setOnInsert: {
        symbol: "BTC",
        name: "Bitcoin",
        type: "crypto",
        enabled: true,
        depositEnabled: true,
        withdrawalEnabled: true,
        tradingEnabled: true,
      },
    },
    { upsert: true, new: true }
  );

  const wallet = await Wallet.create({
    userId: user._id,
    mode: "live",
    type: "spot",
    balances: [
      {
        asset: "USDT",
        available: 50000,
        locked: 0,
      },
      {
        asset: "BTC",
        available: 10,
        locked: 0,
      },
    ],
  });

  const bot = await createGridBot({
    userId: user._id,
    mode: "live",
    symbol: "BTCUSDT",
    lowerPrice: 90000,
    upperPrice: 110000,
    gridCount: 5,
    quantityPerGrid: 0.01,
  });

  console.log("✅ Grid bot created:", String(bot._id));

  await startGridBot(
    String(bot._id),
    user._id
  );

  console.log("✅ Grid bot started");

  const synced =
    await syncGridOrders(
      String(bot._id),
      user._id
    );

  console.log(
    "Orders created:",
    synced.totalCreated
  );

  if (synced.totalCreated <= 0) {
    throw new Error(
      "GRID_DID_NOT_CREATE_ORDERS"
    );
  }

  const tracked =
    await GridBotOrder.find({
      botId: bot._id,
      handled: false,
    }).lean();

  if (tracked.length <= 0) {
    throw new Error(
      "GRID_TRACKING_RECORDS_MISSING"
    );
  }

  console.log(
    "✅ GridBotOrder tracking records:",
    tracked.length
  );

  const openOrders =
    await Order.countDocuments({
      userId: user._id,
      mode: "live",
      symbol: "BTCUSDT",
      status: "open",
    });

  console.log(
    "Open exchange orders:",
    openOrders
  );

  if (openOrders <= 0) {
    throw new Error(
      "NO_OPEN_GRID_ORDERS"
    );
  }

  // نبحث عن أول أمر شراء ونحوّله إلى filled
  // لاختبار دورة الـbot فقط.
  const buy =
    await Order.findOne({
      userId: user._id,
      mode: "live",
      symbol: "BTCUSDT",
      side: "buy",
      status: "open",
    }).sort({ price: -1 });

  if (!buy) {
    throw new Error(
      "NO_GRID_BUY_ORDER"
    );
  }

  buy.status = "filled";
  buy.quantity = 0;
  buy.filledQuantity =
    buy.originalQuantity ||
    0.01;

  await buy.save();

  console.log(
    "✅ Simulated grid fill:",
    String(buy._id)
  );

  const cycle =
    await runGridBotCycle(
      String(bot._id)
    );

  console.log(
    "Cycle result:",
    JSON.stringify(
      cycle,
      null,
      2
    )
  );

  if (
    Number(cycle.handled || 0) <= 0
  ) {
    throw new Error(
      "GRID_FILL_NOT_HANDLED"
    );
  }

  const replacement =
    await GridBotOrder.findOne({
      botId: bot._id,
      handled: false,
      side: "sell",
    }).lean();

  if (!replacement) {
    throw new Error(
      "GRID_COUNTER_ORDER_NOT_AVAILABLE"
    );
  }

  console.log(
    "✅ Grid counter SELL is available:",
    String(replacement.orderId)
  );

  if (Number(cycle.replaced || 0) > 0) {
    console.log(
      "✅ Counter order was newly created"
    );
  } else {
    console.log(
      "✅ Counter order already existed at the next grid level"
    );
  }

  console.log(
    "✅ Counter order created:",
    String(replacement.orderId)
  );

  await GridBotOrder.deleteMany({
    botId: bot._id,
  });

  await Order.deleteMany({
    userId: user._id,
    mode: "live",
    symbol: "BTCUSDT",
  });

  await GridBot.deleteMany({
    _id: bot._id,
  });

  await Wallet.deleteMany({
    _id: wallet._id,
  });

  await User.deleteMany({
    _id: user._id,
  });

  console.log(
    "✅ Test data cleaned"
  );

  console.log(
    "\n✅ GRID BOT CYCLE TEST PASSED"
  );

  process.exit(0);
}

main().catch((error) => {
  console.error(
    "\n❌ GRID BOT CYCLE TEST FAILED\n",
    error
  );

  process.exit(1);
});
