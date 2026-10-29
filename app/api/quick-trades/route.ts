import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { debitDepositBalance } from "@/lib/deposit-balance-source";
import LedgerEntry from "@/models/LedgerEntry";
import QuickTrade from "@/models/QuickTrade";

export const dynamic = "force-dynamic";
const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "سجّل الدخول أولًا" }, { status: 401 });
    await connectDB();

    const now = new Date();
    await QuickTrade.updateMany(
      { userId: user._id, mode: "live", status: "open", expiresAt: { $lte: now } },
      { $set: { status: "closed", outcome: "loss", closedAt: now } }
    );

    const symbol = String(new URL(request.url).searchParams.get("symbol") || "").trim().toUpperCase();
    const filter: Record<string, unknown> = { userId: user._id, mode: "live" };
    if (symbol) filter.symbol = symbol;

    const trades = await QuickTrade.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    return NextResponse.json({ success: true, trades }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QUICK TRADES GET:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل سجل الصفقات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "سجّل الدخول أولًا" }, { status: 401 });
    await connectDB();

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

    // The real deposit balance is the only source of funds used here. Withdrawal
    // earnings and the spot wallet are deliberately never debited by this route.
    const session = await mongoose.startSession();
    let createdTrade: any = null;
    let availableAfter: number | null = null;
    let availableBefore = 0;
    try {
      await session.withTransaction(async () => {
        const debit = await debitDepositBalance(user._id, "USDT", stakeAmount, session);
        availableBefore = debit.availableBefore;
        if (!debit.ok) return;

        const openedAt = new Date();
        const expiresAt = new Date(openedAt.getTime() + 5 * 60 * 1000);
        const rows = await QuickTrade.create([{
          userId: user._id,
          symbol,
          side,
          stakeAmount,
          entryPrice,
          status: "open",
          openedAt,
          expiresAt,
          mode: "live",
        }], { session });
        const trade = rows[0];
        availableAfter = roundAmount(debit.availableBefore - stakeAmount);

        await LedgerEntry.create([{
          userId: user._id,
          scope: "user",
          asset: "USDT",
          mode: "live",
          type: "trade",
          amount: -stakeAmount,
          balanceBefore: debit.availableBefore,
          balanceAfter: availableAfter,
          referenceId: `separate-deposit-spend:quick-trade:${String(trade._id)}`,
          note: "خصم قيمة صفقة الخمس دقائق من رصيد الإيداع",
        }], { session });

        createdTrade = trade.toObject();
      });
    } finally {
      await session.endSession();
    }

    if (!createdTrade || availableAfter === null) {
      return NextResponse.json({
        success: false,
        message: "رصيد الإيداع المتاح من USDT غير كافٍ",
        availableBalance: availableBefore,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "تم فتح الصفقة وخصم مبلغها من رصيد الإيداع",
      trade: createdTrade,
      balance: availableAfter,
      balanceAsset: "USDT",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QUICK TRADES POST:", error);
    return NextResponse.json({ success: false, message: "تعذر فتح الصفقة؛ لم يتم اعتماد الخصم" }, { status: 500 });
  }
}
