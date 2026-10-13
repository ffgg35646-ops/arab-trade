import { requireVerifiedIdentity } from "@/lib/require-kyc";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import FuturesOrder from "@/models/FuturesOrder";

export async function GET(request: NextRequest) {
  try {
    const kycGuard = await requireVerifiedIdentity(request);

    if (!kycGuard.ok) {
      return NextResponse.json(
        {
          success: false,
          message: kycGuard.message,
        },
        { status: kycGuard.status }
      );
    }

    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    await connectDB();

    const rows = await FuturesOrder.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    return NextResponse.json({ orders: rows });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "فشل تحميل طلبات العقود" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    await connectDB();
    await migrateLegacyDepositBalancesToSpotWallet(user._id);

    const body = await request.json();

    const symbol = String(body.symbol || "").toUpperCase();
    const side = String(body.side || "");
    const type = String(body.type || "limit");
    const quantity = Number(body.quantity);
    const price = Number(body.price || 0);
    const leverage = Number(body.leverage || 1);
    const marginMode =
      body.marginMode === "cross" ? "cross" : "isolated";
    const reduceOnly = Boolean(body.reduceOnly);

    if (!symbol || !["long", "short"].includes(side)) {
      return NextResponse.json(
        { error: "العقد أو الاتجاه غير صحيح" },
        { status: 400 }
      );
    }

    if (!["limit", "market"].includes(type)) {
      return NextResponse.json(
        { error: "نوع الأمر غير صحيح" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "الكمية غير صحيحة" },
        { status: 400 }
      );
    }

    if (type === "limit" && (!Number.isFinite(price) || price <= 0)) {
      return NextResponse.json(
        { error: "السعر غير صحيح" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(leverage) || leverage < 1 || leverage > 125) {
      return NextResponse.json(
        { error: "الرافعة يجب أن تكون بين 1 و125" },
        { status: 400 }
      );
    }

    const order = await FuturesOrder.create({
      userId: user._id,
      symbol,
      side,
      type,
      quantity,
      price,
      leverage,
      marginMode,
      reduceOnly,
      status: type === "market" ? "filled" : "open"
    });

    return NextResponse.json(
      { success: true, order },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر إنشاء أمر العقود" },
      { status: 400 }
    );
  }
}