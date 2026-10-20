import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Wallet from "@/models/Wallet";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getBinanceSpotPair } from "@/lib/binance-market";
import { getBinancePublicPrice, isBinanceLiveTradingConfigured } from "@/lib/binance-trading";
import { calculateTradingFee } from "@/lib/fee-engine";

export const dynamic = "force-dynamic";

const round8 = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
    }

    const url = new URL(request.url);
    const asset = String(url.searchParams.get("asset") || "").trim().toUpperCase();
    const quantity = Number(url.searchParams.get("quantity"));

    if (!/^[A-Z0-9]{2,20}$/.test(asset) || !Number.isFinite(quantity) || quantity <= 0 || round8(quantity) !== quantity) {
      return NextResponse.json({ success: false, message: "اختر عملة وكمية صحيحتين بحد أقصى 8 منازل عشرية." }, { status: 400 });
    }

    await connectDB();
    const wallet = await Wallet.findOne({ userId: user._id, type: "spot", mode: "live" }).select("balances").lean();
    const row = (wallet?.balances || []).find((item: any) => String(item.asset || "").toUpperCase() === asset);
    const available = Number(row?.available || 0);

    if (quantity > available + 1e-8) {
      return NextResponse.json({ success: false, message: "الكمية المطلوبة أكبر من الرصيد المتاح لهذه العملة.", available }, { status: 409 });
    }

    let price = 1;
    if (asset !== "USDT") {
      const pair = await getBinanceSpotPair(asset + "USDT");
      if (!pair || pair.baseAsset !== asset || pair.quoteAsset !== "USDT") {
        return NextResponse.json({ success: false, message: "لا يوجد زوج Spot مباشر نشط لهذه العملة مقابل USDT على Binance." }, { status: 422 });
      }
      price = await getBinancePublicPrice(pair.symbol);
    }

    const settings = await getPlatformSettings();
    const tradingFeePercent = Math.min(100, Math.max(0, Number(settings.trading?.defaultFeePercent || 0)));
    const marketValueUsdt = round8(quantity * price);
    const estimatedTradingFeeUsdt = round8(calculateTradingFee(marketValueUsdt, tradingFeePercent));
    const estimatedAfterTradingFeeUsdt = round8(Math.max(0, marketValueUsdt - estimatedTradingFeeUsdt));
    const withdrawalFeePercent = 5;
    const estimatedWithdrawalFeeUsdt = round8(estimatedAfterTradingFeeUsdt * withdrawalFeePercent / 100);
    const estimatedPayoutUsdt = round8(Math.max(0, estimatedAfterTradingFeeUsdt - estimatedWithdrawalFeeUsdt));

    return NextResponse.json({
      success: true,
      source: "binance",
      asset,
      quantity,
      available,
      pair: asset === "USDT" ? "USDT" : asset + "USDT",
      priceUsdt: price,
      marketValueUsdt,
      tradingFeePercent,
      estimatedTradingFeeUsdt,
      estimatedAfterTradingFeeUsdt,
      withdrawalFeePercent,
      estimatedWithdrawalFeeUsdt,
      estimatedPayoutUsdt,
      externalExecutionConfigured: isBinanceLiveTradingConfigured(),
      executable: asset === "USDT" || isBinanceLiveTradingConfigured(),
      quoteIsIndicative: true,
      disclaimer: "السعر تقديري وفق آخر سعر Binance ولا يضمن سعر تنفيذ أمر السوق. لم يتم تنفيذ بيع أو إنشاء طلب سحب من واجهة التسعير هذه.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("WITHDRAWAL QUOTE:", error);
    return NextResponse.json({
      success: false,
      message: "تعذر حساب قيمة العملة من السوق الحالي. لم يتم بيع أي عملة.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
