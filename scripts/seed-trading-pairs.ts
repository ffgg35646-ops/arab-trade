import { connectDB } from "../lib/mongodb";
import Asset from "../models/Asset";
import TradingPair from "../models/TradingPair";

async function main() {
  await connectDB();

  const assets = await Asset.find({
    enabled: true,
    tradingEnabled: true,
  })
    .select("symbol")
    .sort({ sortOrder: 1, symbol: 1 })
    .lean();

  let created = 0;
  let existed = 0;

  for (const asset of assets as any[]) {
    const base = String(asset.symbol).toUpperCase();

    if (base === "USDT") {
      continue;
    }

    const symbol = `${base}USDT`;

    const exists = await TradingPair.findOne({ symbol });

    if (exists) {
      existed++;
      continue;
    }

    await TradingPair.create({
      symbol,
      baseAsset: base,
      quoteAsset: "USDT",
      status: "HALT",
      spotTradingEnabled: false,
      minPrice: 0,
      maxPrice: 0,
      tickSize: 0.00000001,
      minQuantity: 0,
      maxQuantity: 0,
      stepSize: 0.00000001,
      minNotional: 0,
      pricePrecision: 8,
      quantityPrecision: 8,
      sortOrder: created + 1,
    });

    created++;
  }

  console.log("TRADING PAIRS SEED COMPLETE");
  console.log("CREATED:", created);
  console.log("EXISTED:", existed);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});