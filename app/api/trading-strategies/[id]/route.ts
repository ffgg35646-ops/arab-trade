import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import SpotStrategy from "@/models/SpotStrategy";
import {
  executeManualStrategyAction,
  pauseSpotStrategy,
  startSpotStrategy,
} from "@/lib/spot-strategies";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  }

  await connectDB();
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ success: false, message: "معرف الاستراتيجية غير صالح" }, { status: 400 });
  }

  const strategy = await SpotStrategy.findOne({ _id: id, userId: user._id }).lean();
  if (!strategy) {
    return NextResponse.json({ success: false, message: "الاستراتيجية غير موجودة" }, { status: 404 });
  }

  return NextResponse.json({ success: true, strategy }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  }

  await connectDB();
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ success: false, message: "معرف الاستراتيجية غير صالح" }, { status: 400 });
  }

  const strategy = await SpotStrategy.findOne({ _id: id, userId: user._id });
  if (!strategy) {
    return NextResponse.json({ success: false, message: "الاستراتيجية غير موجودة" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  try {
    let result: any;
    if (action === "start") {
      result = await startSpotStrategy(strategy);
    } else if (action === "pause") {
      result = await pauseSpotStrategy(strategy);
    } else if (action === "execute-buy" || action === "execute-sell") {
      result = await executeManualStrategyAction(strategy, action);
    } else {
      return NextResponse.json({ success: false, message: "الإجراء غير صالح" }, { status: 400 });
    }

    return NextResponse.json({ success: true, strategy: result });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "تعذر تحديث الاستراتيجية",
    }, { status: 400 });
  }
}
