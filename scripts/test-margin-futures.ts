import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import MarginPosition from "@/models/MarginPosition";
import FuturesPosition from "@/models/FuturesPosition";

let pass = 0;
let fail = 0;

function ok(name: string, condition: boolean, value?: unknown) {
  if (condition) {
    pass++;
    console.log(`[PASS] ${name}${value !== undefined ? ` => ${value}` : ""}`);
  } else {
    fail++;
    console.log(`[FAIL] ${name}${value !== undefined ? ` => ${value}` : ""}`);
  }
}

async function main() {
  await connectDB();

  const user =
    await User.findOne({ email: "dev-seller@arabtrade.local" }) ||
    await User.findOne({ role: "admin_leader" });

  if (!user) throw new Error("TEST_USER_NOT_FOUND");

  await MarginPosition.deleteMany({
    userId: user._id,
    symbol: "BTCUSDT"
  });

  await FuturesPosition.deleteMany({
    userId: user._id,
    symbol: "BTCUSDT"
  });

  const marginNotional = 100 * 100;
  const margin = marginNotional / 10;

  const marginPosition = await MarginPosition.create({
    userId: user._id,
    symbol: "BTCUSDT",
    side: "long",
    quantity: 100,
    entryPrice: 100,
    markPrice: 100,
    leverage: 10,
    margin,
    borrowed: marginNotional - margin,
    interest: 0,
    pnl: 0,
    status: "open"
  });

  ok("فتح Margin Long", marginPosition.status === "open");
  ok("Margin leverage", marginPosition.leverage === 10);
  ok("Margin collateral", marginPosition.margin === 1000);

  marginPosition.markPrice = 110;
  marginPosition.pnl =
    (marginPosition.markPrice - marginPosition.entryPrice) *
    marginPosition.quantity;

  ok("Margin PnL", marginPosition.pnl === 1000, marginPosition.pnl);

  marginPosition.status = "closed";
  await marginPosition.save();

  ok("إغلاق Margin", marginPosition.status === "closed");

  const futuresNotional = 50 * 100;
  const futuresMargin = futuresNotional / 5;
  const liquidationPrice = 100 - (100 * (1 / 5) * 0.9);

  const futuresPosition = await FuturesPosition.create({
    userId: user._id,
    symbol: "BTCUSDT",
    side: "long",
    quantity: 50,
    entryPrice: 100,
    markPrice: 100,
    leverage: 5,
    marginMode: "isolated",
    margin: futuresMargin,
    pnl: 0,
    liquidationPrice,
    status: "open"
  });

  ok("فتح Futures Long", futuresPosition.status === "open");
  ok("Futures leverage", futuresPosition.leverage === 5);
  ok("Futures margin", futuresPosition.margin === 1000);
  ok("Liquidation price", futuresPosition.liquidationPrice === 82, futuresPosition.liquidationPrice);

  futuresPosition.markPrice = 108;
  futuresPosition.pnl =
    (futuresPosition.markPrice - futuresPosition.entryPrice) *
    futuresPosition.quantity;

  ok("Futures PnL", futuresPosition.pnl === 400, futuresPosition.pnl);

  futuresPosition.status = "closed";
  await futuresPosition.save();

  ok("إغلاق Futures", futuresPosition.status === "closed");

  const shortPosition = await FuturesPosition.create({
    userId: user._id,
    symbol: "ETHUSDT",
    side: "short",
    quantity: 10,
    entryPrice: 200,
    markPrice: 180,
    leverage: 10,
    marginMode: "isolated",
    margin: 200,
    pnl: 0,
    liquidationPrice: 218,
    status: "open"
  });

  shortPosition.pnl =
    (shortPosition.entryPrice - shortPosition.markPrice) *
    shortPosition.quantity;

  ok("Short PnL", shortPosition.pnl === 200, shortPosition.pnl);

  shortPosition.status = "closed";
  await shortPosition.save();

  ok("إغلاق Short", shortPosition.status === "closed");

  await MarginPosition.deleteMany({
    userId: user._id,
    symbol: { $in: ["BTCUSDT"] }
  });

  await FuturesPosition.deleteMany({
    userId: user._id,
    symbol: { $in: ["BTCUSDT", "ETHUSDT"] }
  });

  console.log();
  console.log("==================================================");
  console.log("MARGIN + FUTURES TEST");
  console.log("PASS :", pass);
  console.log("FAIL :", fail);
  console.log("==================================================");

  await mongoose.connection.close();

  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("FATAL TEST ERROR:");
  console.error(error);

  try {
    await mongoose.connection.close();
  } catch {}

  process.exit(1);
});