
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import FuturesPosition from "@/models/FuturesPosition";
import FundingPayment from "@/models/FundingPayment";
import { fundingPayment } from "@/lib/futures-risk";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    await connectDB();

    const rows = await FundingPayment.find({
      userId: user._id
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ payments: rows });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر تحميل التمويل" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    await connectDB();
    await migrateLegacyDepositBalancesToSpotWallet(user._id);

    const body = await request.json();
    const positionId = String(body.positionId || "");
    const rate = Number(body.fundingRate);

    if (!positionId || !Number.isFinite(rate)) {
      return NextResponse.json(
        { error: "بيانات التمويل غير صحيحة" },
        { status: 400 }
      );
    }

    const position = await FuturesPosition.findOne({
      _id: positionId,
      userId: user._id,
      status: "open"
    });

    if (!position) {
      return NextResponse.json(
        { error: "الصفقة غير موجودة" },
        { status: 404 }
      );
    }

    const notional = position.quantity * position.markPrice;
    const amount = fundingPayment(notional, rate);

    const payment = await FundingPayment.create({
      userId: user._id,
      positionId: position._id,
      symbol: position.symbol,
      notional,
      fundingRate: rate,
      amount,
      status: "pending"
    });

    return NextResponse.json({
      success: true,
      payment
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر إنشاء دفعة التمويل" },
      { status: 400 }
    );
  }
}