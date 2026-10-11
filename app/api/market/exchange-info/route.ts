import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Asset from "@/models/Asset";
import TradingPair from "@/models/TradingPair";

export async function GET() {
  try {
    await connectDB();

    const [assets, pairs] = await Promise.all([
      Asset.find({ enabled: true })
        .sort({ sortOrder: 1, symbol: 1 })
        .lean(),

      TradingPair.find({
        status: "TRADING",
        spotTradingEnabled: true,
      })
        .sort({ sortOrder: 1, symbol: 1 })
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      assets: assets.map((asset: any) => ({
        symbol: asset.symbol,
        name: asset.name,
        status: asset.enabled ? "ENABLED" : "DISABLED",
        tradingEnabled: asset.tradingEnabled,
        depositEnabled: asset.depositEnabled,
        withdrawalEnabled: asset.withdrawalEnabled,
        networks: (asset.networks || []).map((network: any) => ({
          name: network.name,
          code: network.code,
          status: network.enabled ? "ENABLED" : "DISABLED",
          depositEnabled: network.depositEnabled,
          withdrawalEnabled: network.withdrawalEnabled,
        })),
      })),

      symbols: pairs.map((pair: any) => ({
        symbol: pair.symbol,
        baseAsset: pair.baseAsset,
        quoteAsset: pair.quoteAsset,
        status: pair.status,
        filters: {
          minPrice: pair.minPrice,
          maxPrice: pair.maxPrice,
          tickSize: pair.tickSize,
          minQuantity: pair.minQuantity,
          maxQuantity: pair.maxQuantity,
          stepSize: pair.stepSize,
          minNotional: pair.minNotional,
        },
        pricePrecision: pair.pricePrecision,
        quantityPrecision: pair.quantityPrecision,
      })),
    });
  } catch (error) {
    console.error("EXCHANGE INFO ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل معلومات السوق" },
      { status: 500 }
    );
  }
}