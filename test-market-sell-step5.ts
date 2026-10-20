import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const mongoose = (await import("mongoose")).default;
  const { connectDB } = await import("@/lib/mongodb");
  const User = (await import("@/models/User")).default;
  const Wallet = (await import("@/models/Wallet")).default;
  const Order = (await import("@/models/Order")).default;
  const Trade = (await import("@/models/Trade")).default;
  const Asset = (await import("@/models/Asset")).default;
  const Notification = (await import("@/models/Notification")).default;
  const LedgerEntry = (await import("@/models/LedgerEntry")).default;
  const { getPlatformSettings } = await import("@/lib/platform-settings");
  const { calculateTradingFee } = await import("@/lib/fee-engine");
  const { matchOrder } = await import("@/lib/matching-engine");

  await connectDB();

  const suffix = `market-sell-${Date.now()}`;
  let buyer: any = null;
  let seller: any = null;
  let session: any = null;

  try {
    for (const asset of [
      { symbol: "BTC", name: "Bitcoin" },
      { symbol: "USDT", name: "Tether" },
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
        { upsert: true, returnDocument: "after" }
      );
    }

    const settings = await getPlatformSettings();
    const feePercent = Number(settings.trading.defaultFeePercent || 0);
    const notional = 100;
    const buyerFee = calculateTradingFee(notional, feePercent);
    const reserve = Number((notional + buyerFee).toFixed(12));

    buyer = await User.create({
      name: "Market Sell Test Buyer",
      username: suffix.slice(0, 25) + "b",
      email: `${suffix}-buyer@example.test`,
      password: "TestOnly-123456",
      referralCode: `B${Date.now()}`,
      role: "user",
      isActive: true,
      isVerified: true,
    });

    seller = await User.create({
      name: "Market Sell Test Seller",
      username: suffix.slice(0, 24) + "s",
      email: `${suffix}-seller@example.test`,
      password: "TestOnly-123456",
      referralCode: `S${Date.now()}`,
      role: "user",
      isActive: true,
      isVerified: true,
    });

    await Wallet.create([
      {
        userId: buyer._id,
        mode: "demo",
        type: "spot",
        balances: [
          { asset: "USDT", available: 0, locked: reserve },
          { asset: "BTC", available: 0, locked: 0 },
        ],
      },
      {
        userId: seller._id,
        mode: "demo",
        type: "spot",
        balances: [
          { asset: "BTC", available: 0.1, locked: 0 },
          { asset: "USDT", available: 0, locked: 0 },
        ],
      },
    ]);

    const [buyOrder, marketSellOrder] = await Order.create([
      {
        userId: buyer._id,
        mode: "demo",
        symbol: "BTCUSDT",
        side: "buy",
        type: "limit",
        price: 1000,
        quantity: 0.1,
        originalQuantity: 0.1,
        filledQuantity: 0,
        quoteAmount: notional,
        status: "open",
      },
      {
        userId: seller._id,
        mode: "demo",
        symbol: "BTCUSDT",
        side: "sell",
        type: "market",
        price: 1000,
        quantity: 0.1,
        originalQuantity: 0.1,
        filledQuantity: 0,
        quoteAmount: 0,
        status: "open",
      },
    ]);

    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const result = await matchOrder(String(marketSellOrder._id), "demo", session);
      if (result.matched !== 1) throw new Error(`EXPECTED_ONE_MARKET_SELL_MATCH_GOT_${result.matched}`);
    });

    const [sellAfter, buyAfter, trade, buyerWallet, sellerWallet] = await Promise.all([
      Order.findById(marketSellOrder._id).lean(),
      Order.findById(buyOrder._id).lean(),
      Trade.findOne({ sellOrderId: marketSellOrder._id, buyOrderId: buyOrder._id, mode: "demo" }).lean(),
      Wallet.findOne({ userId: buyer._id, type: "spot", mode: "demo" }).lean(),
      Wallet.findOne({ userId: seller._id, type: "spot", mode: "demo" }).lean(),
    ]);

    const balance = (wallet: any, asset: string) =>
      wallet?.balances?.find((row: any) => row.asset === asset) ?? { available: 0, locked: 0 };

    const buyerUsdt = balance(buyerWallet, "USDT");
    const buyerBtc = balance(buyerWallet, "BTC");
    const sellerBtc = balance(sellerWallet, "BTC");
    const sellerUsdt = balance(sellerWallet, "USDT");

    const approximately = (actual: unknown, expected: number) =>
      Math.abs(Number(actual) - expected) < 1e-8;

    const passed =
      sellAfter?.status === "filled" &&
      buyAfter?.status === "filled" &&
      trade?.takerSide === "sell" &&
      approximately(trade?.price, 1000) &&
      approximately(trade?.quantity, 0.1) &&
      approximately(sellerBtc.available, 0) &&
      approximately(sellerBtc.locked, 0) &&
      approximately(buyerBtc.available, 0.1) &&
      approximately(buyerUsdt.available, 0) &&
      approximately(buyerUsdt.locked, 0) &&
      approximately(sellerUsdt.available, notional - Number(trade?.feeSeller || 0));

    if (!passed) {
      console.error({ sellStatus: sellAfter?.status, buyStatus: buyAfter?.status, trade, buyerUsdt, buyerBtc, sellerBtc, sellerUsdt });
      throw new Error("MARKET_SELL_SETTLEMENT_TEST_FAILED");
    }

    console.log("✅ MARKET SELL SETTLEMENT TEST PASSED");
    console.log("✅ Seller inventory was reserved before debit");
    console.log("✅ Buyer and seller balances settled and both orders filled");
    console.log("✅ Average price, notional, and taker side persisted");
  } finally {
    if (session) await session.endSession();
    if (buyer?._id && seller?._id) {
      await Promise.all([
        Trade.deleteMany({ $or: [{ buyerId: buyer._id }, { sellerId: seller._id }] }),
        Order.deleteMany({ userId: { $in: [buyer._id, seller._id] } }),
        Wallet.deleteMany({ userId: { $in: [buyer._id, seller._id] } }),
        Notification.deleteMany({ userId: { $in: [buyer._id, seller._id] } }),
        LedgerEntry.deleteMany({ userId: { $in: [buyer._id, seller._id] } }),
        User.deleteMany({ _id: { $in: [buyer._id, seller._id] } }),
      ]);
    }
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error("❌ MARKET SELL SETTLEMENT TEST FAILED", error);
  try {
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
