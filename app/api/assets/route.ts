import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Asset from "@/models/Asset";

export async function GET() {
  try {
    await connectDB();

    const assets = await Asset.find({
      enabled: true,
    })
      .select(
        "name symbol type enabled depositEnabled withdrawalEnabled tradingEnabled sortOrder networks"
      )
      .sort({ sortOrder: 1, symbol: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      assets,
    });
  } catch (error) {
    console.error("ASSETS GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل الأصول",
      },
      { status: 500 }
    );
  }
}