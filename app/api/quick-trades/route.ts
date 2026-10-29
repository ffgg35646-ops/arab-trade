import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Wallet from "@/models/Wallet";
import QuickTrade from "@/models/QuickTrade";

export const dynamic = "force-dynamic";
const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

async function ensureDemoWallet(userId: unknown) {
  let wallet = await Wallet.findOne({ userId, type: "spot", mode: "demo" });
  if (wallet) return wallet;
  try {
    return await Wallet.create({
      userId, type: "spot", mode: "demo",
      balances: [{ asset: "USDT", available: 10000, locked: 0 }],
    });
  } catch (error) {
    // Another request may have initialized the same demo wallet concurrently.
    wallet = await Wallet.findOne({ userId, type: "spot", mode: "demo" });
    if (wallet) return wallet;
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "سجّل الدخول أولًا" }, { status: 401 });
    await connectDB();
    await ensureDemoWallet(user._id);

    const now = new Date();
    await QuickTrade.updateMany(
      { userId: user._id, status: "open", expiresAt: { $lte: now } },
      { $set: { status: "closed", outcome: "loss", closedAt: now } }
    );

    const symbol = String(new URL(request.url).searchParams.get("symbol") || "").trim().toUpperCase();
    const filter: Record<string, unknown> = { userId: user._id, mode: "demo" };
    if (symbol) filter.symbol = symbol;

    const trades = await QuickTrade.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    return NextResponse.json({ success: true, trades }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QUICK TRADES GET:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل سجل الصفقات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let deducted = 0;
  let userId: any = null;
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "سجّل الدخول أولًا" }, { status: 401 });
    await connectDB();
    userId = user._id;
    await ensureDemoWallet(user._id);
    const body = await request.json().catch(() => ({}));
    const symbol = String(body.symbol || "").trim().toUpperCase().replace(/[_/\\s-]/g, "");
    const side = String(body.side || "").toLowerCase();
    const entryPrice = Number(body.price);
    const stakeAmount = roundAmount(Number(body.amount));
    if (!/^[A-Z0-9]{5,25}$/.test(symbol) || !["buy", "sell"].includes(side) ||
        !Number.isFinite(entryPrice) || entryPrice <= 0 ||
        !Number.isFinite(stakeAmount) || stakeAmount < 1 || stakeAmount > 100000) {
      return NextResponse.json({ success: false, message: "أدخل مبلغًا لا يقل عن 1 USDT وسعرًا صحيحًا" }, { status: 400 });
    }

    // Reserve/deduct USDT atomically so two parallel taps cannot spend the same funds.
    const wallet = await Wallet.findOneAndUpdate(
      { userId: user._id, type: "spot", mode: "demo", balances: { $elemMatch: { asset: "USDT", available: { $gte: stakeAmount } } } },
      { $inc: { "balances.$.available": -stakeAmount } },
      { new: true }
    );
    if (!wallet) {
      return NextResponse.json({ success: false, message: "رصيد USDT المتاح غير كافٍ" }, { status: 400 });
    }
    deducted = stakeAmount;

    const openedAt = new Date();
    const trade = await QuickTrade.create({
      userId: user._id, symbol, side, stakeAmount, entryPrice,
      status: "open", openedAt,
      expiresAt: new Date(openedAt.getTime() + 5 * 60 * 1000),
      mode: "demo",
    });

    const usdt = wallet.balances.find((balance: any) => String(balance.asset).toUpperCase() === "USDT");
    return NextResponse.json({
      success: true,
      message: "تم فتح الصفقة وخصم المبلغ من رصيدك",
      trade: trade.toObject(),
      balance: usdt?.available ?? null,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (deducted > 0 && userId) {
      try {
        await Wallet.updateOne(
          { userId, type: "spot", mode: "demo", "balances.asset": "USDT" },
          { $inc: { "balances.$.available": deducted } }
        );
      } catch (refundError) {
        console.error("QUICK TRADE COMPENSATING REFUND FAILED:", refundError);
      }
    }
    console.error("QUICK TRADES POST:", error);
    return NextResponse.json({ success: false, message: "تعذر فتح الصفقة؛ لم يتم الاحتفاظ بالخصم" }, { status: 500 });
  }
}
