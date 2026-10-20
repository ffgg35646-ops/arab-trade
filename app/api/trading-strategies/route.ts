import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import SpotStrategy from "@/models/SpotStrategy";
import { createSpotStrategy } from "@/lib/spot-strategies";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  }

  await connectDB();
  const strategies = await SpotStrategy.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({
    success: true,
    strategies,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  }

  await connectDB();
  const body = await request.json().catch(() => ({}));
  const stopLossRaw = body.stopLossPrice;
  const stopLossPrice =
    stopLossRaw === undefined || stopLossRaw === null || String(stopLossRaw).trim() === ""
      ? undefined
      : Number(stopLossRaw);

  try {
    const strategy = await createSpotStrategy({
      userId: user._id,
      symbol: String(body.symbol || ""),
      executionMode: body.executionMode === "bot" ? "bot" : "manual",
      entryOperator: body.entryOperator === "at_or_above" ? "at_or_above" : "at_or_below",
      entryPrice: Number(body.entryPrice),
      takeProfitPrice: Number(body.takeProfitPrice),
      ...(stopLossPrice === undefined ? {} : { stopLossPrice }),
      quoteBudget: Number(body.quoteBudget),
      maxCycles: Number(body.maxCycles),
    });

    return NextResponse.json({
      success: true,
      strategy,
      message: "تم إنشاء الاستراتيجية وهي متوقفة. راجع القواعد ثم اضغط تشغيل.",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "تعذر إنشاء استراتيجية التداول",
    }, { status: 400 });
  }
}
