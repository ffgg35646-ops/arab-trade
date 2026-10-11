import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const mongoose = await import("mongoose");
  const { connectDB } = await import("@/lib/mongodb");
  const User = (await import("@/models/User")).default;
  const Wallet = (await import("@/models/Wallet")).default;
  const Order = (await import("@/models/Order")).default;
  const { releaseOrderLock } = await import("@/lib/matching-engine");

  await connectDB();

  const id = Date.now();

  const user = await User.create({
    name: "Cancel Test",
    username: `cancel${id}`,
    email: `cancel${id}@example.com`,
    password: "Test123456",
    referralCode: `C${id}`,
    role: "user",
    isActive: true,
  });

  try {
    await Wallet.create({
      userId: user._id,
      type: "spot",
      mode: "demo",
      balances: [
        { asset: "USDT", available: 899.9, locked: 100.1 },
        { asset: "BTC", available: 0, locked: 0 },
      ],
    });

    const order = await Order.create({
      userId: user._id,
      mode: "demo",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      price: 1000,
      quantity: 0.1,
      quoteAmount: 100,
      originalQuantity: 0.1,
      filledQuantity: 0,
      status: "cancelled",
    });

    await releaseOrderLock(String(order._id));

    const wallet = await Wallet.findOne({
      userId: user._id,
      type: "spot",
      mode: "demo",
    }).lean();

    const usdt = wallet?.balances?.find(
      (x: any) => x.asset === "USDT"
    );

    console.log("USDT available:", usdt?.available);
    console.log("USDT locked:", usdt?.locked);

    if (
      Number(usdt?.available) !== 1000 ||
      Number(usdt?.locked) !== 0
    ) {
      throw new Error("CANCEL_RELEASE_TEST_FAILED");
    }

    console.log("✅ CANCEL + RELEASE LOCK TEST PASSED");
  } finally {
    await Order.deleteMany({ userId: user._id });
    await Wallet.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error("❌ CANCEL TEST ERROR:", error);
  try {
    const mongoose = await import("mongoose");
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
