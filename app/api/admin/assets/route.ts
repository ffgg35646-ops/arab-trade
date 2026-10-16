import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Asset from "@/models/Asset";
import { requireAdminLeader } from "@/lib/admin-auth";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

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

    const assets = await Asset.find({})
      .sort({ sortOrder: 1, symbol: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      assets: assets.map((asset: any) => ({
        ...asset,
        _id: String(asset._id),
      })),
    });
  } catch (error) {
    console.error("ADMIN ASSETS GET:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل العملات" },
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

    const name = clean(body.name);
    const symbol = clean(body.symbol).toUpperCase();

    if (!name || !symbol) {
      return NextResponse.json(
        { success: false, message: "اسم العملة والرمز مطلوبان" },
        { status: 400 }
      );
    }

    if (!/^[A-Z0-9]{2,20}$/.test(symbol)) {
      return NextResponse.json(
        { success: false, message: "رمز العملة غير صالح" },
        { status: 400 }
      );
    }

    await connectDB();

    const exists = await Asset.findOne({ symbol });

    if (exists) {
      return NextResponse.json(
        { success: false, message: "العملة موجودة بالفعل" },
        { status: 409 }
      );
    }

    const asset = await Asset.create({
      name,
      symbol,
      type: "crypto",
      enabled: true,
      depositEnabled: true,
      tradingEnabled: true,
      sortOrder: Number(body.sortOrder || 0),
      networks: [],
    });

    return NextResponse.json({
      success: true,
      message: "تمت إضافة العملة",
      asset: {
        ...asset.toObject(),
        _id: String(asset._id),
      },
    });
  } catch (error) {
    console.error("ADMIN ASSETS POST:", error);

    return NextResponse.json(
      { success: false, message: "تعذر إضافة العملة" },
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
    const id = clean(body.id);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "معرّف العملة مطلوب" },
        { status: 400 }
      );
    }

    await connectDB();

    const allowed = [
      "name",
      "enabled",
      "depositEnabled",
      "tradingEnabled",
      "sortOrder",
      "networks",
    ];

    const update: Record<string, unknown> = {};

    for (const key of allowed) {
      if (body[key] !== undefined) {
        update[key] = body[key];
      }
    }

    const asset = await Asset.findByIdAndUpdate(
      id,
      { $set: update },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!asset) {
      return NextResponse.json(
        { success: false, message: "العملة غير موجودة" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث العملة",
      asset: {
        ...asset,
        _id: String(asset._id),
      },
    });
  } catch (error) {
    console.error("ADMIN ASSETS PATCH:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحديث العملة" },
      { status: 500 }
    );
  }
}