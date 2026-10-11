import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import TradingPair from "@/models/TradingPair";
import Asset from "@/models/Asset";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 403 }
      );
    }

    await connectDB();

    const pairs = await TradingPair.find({})
      .sort({ sortOrder: 1, symbol: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      pairs: pairs.map((pair: any) => ({
        ...pair,
        _id: String(pair._id),
      })),
    });
  } catch (error) {
    console.error("ADMIN TRADING PAIRS GET:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل أزواج التداول" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const baseAsset = String(body.baseAsset || "")
      .trim()
      .toUpperCase();

    const quoteAsset = String(body.quoteAsset || "")
      .trim()
      .toUpperCase();

    if (!baseAsset || !quoteAsset || baseAsset === quoteAsset) {
      return NextResponse.json(
        { success: false, message: "الأصل الأساسي وأصل التسعير غير صالحين" },
        { status: 400 }
      );
    }

    await connectDB();

    const [base, quote] = await Promise.all([
      Asset.findOne({
        symbol: baseAsset,
        enabled: true,
      }).select("symbol tradingEnabled"),
      Asset.findOne({
        symbol: quoteAsset,
        enabled: true,
      }).select("symbol tradingEnabled"),
    ]);

    if (!base || !quote) {
      return NextResponse.json(
        { success: false, message: "إحدى العملات غير موجودة" },
        { status: 400 }
      );
    }

    const symbol = `${baseAsset}${quoteAsset}`;

    const exists = await TradingPair.findOne({ symbol });

    if (exists) {
      return NextResponse.json(
        { success: false, message: "زوج التداول موجود بالفعل" },
        { status: 409 }
      );
    }

    const pair = await TradingPair.create({
      symbol,
      baseAsset,
      quoteAsset,
      status: "HALT",
      spotTradingEnabled: false,
      minPrice: Number(body.minPrice || 0),
      maxPrice: Number(body.maxPrice || 0),
      tickSize: Number(body.tickSize || 0.00000001),
      minQuantity: Number(body.minQuantity || 0),
      maxQuantity: Number(body.maxQuantity || 0),
      stepSize: Number(body.stepSize || 0.00000001),
      minNotional: Number(body.minNotional || 0),
      pricePrecision: Number(body.pricePrecision ?? 8),
      quantityPrecision: Number(body.quantityPrecision ?? 8),
      sortOrder: Number(body.sortOrder || 0),
    });

    return NextResponse.json({
      success: true,
      message: "تم إنشاء زوج التداول",
      pair,
    });
  } catch (error) {
    console.error("ADMIN TRADING PAIRS POST:", error);

    return NextResponse.json(
      { success: false, message: "تعذر إنشاء زوج التداول" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const id = String(body.id || "");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "معرف الزوج مطلوب" },
        { status: 400 }
      );
    }

    await connectDB();

    const update: Record<string, unknown> = {};

    for (const key of [
      "status",
      "spotTradingEnabled",
      "minPrice",
      "maxPrice",
      "tickSize",
      "minQuantity",
      "maxQuantity",
      "stepSize",
      "minNotional",
      "pricePrecision",
      "quantityPrecision",
      "sortOrder",
    ]) {
      if (body[key] !== undefined) {
        update[key] = body[key];
      }
    }

    if (update.status !== undefined) {
      if (!["TRADING", "HALT"].includes(String(update.status))) {
        return NextResponse.json(
          { success: false, message: "حالة الزوج غير صحيحة" },
          { status: 400 }
        );
      }
    }

    const pair = await TradingPair.findByIdAndUpdate(
      id,
      { $set: update },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!pair) {
      return NextResponse.json(
        { success: false, message: "زوج التداول غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث زوج التداول",
      pair,
    });
  } catch (error) {
    console.error("ADMIN TRADING PAIRS PATCH:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحديث زوج التداول" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "معرف الزوج مطلوب" },
        { status: 400 }
      );
    }

    await connectDB();

    const deleted = await TradingPair.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "زوج التداول غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم حذف زوج التداول",
    });
  } catch (error) {
    console.error("ADMIN TRADING PAIRS DELETE:", error);

    return NextResponse.json(
      { success: false, message: "تعذر حذف زوج التداول" },
      { status: 500 }
    );
  }
}