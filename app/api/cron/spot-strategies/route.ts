import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { connectDB } from "@/lib/mongodb";
import { runAllSpotStrategies } from "@/lib/spot-strategies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json({ success: false, message: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") || "";
  const alternateSecret = request.headers.get("x-cron-secret") || "";
  const authorized =
    (authorization.startsWith("Bearer ") && safeEqual(authorization.slice(7).trim(), secret)) ||
    safeEqual(alternateSecret.trim(), secret);

  if (!authorized) {
    return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });
  }

  try {
    await connectDB();
    const result = await runAllSpotStrategies();
    return NextResponse.json({
      success: true,
      message: "تم فحص استراتيجيات التداول وتحديث إشاراتها وحالات أوامر Binance.",
      ...result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("SPOT STRATEGIES CRON:", error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "تعذر تشغيل استراتيجيات التداول",
    }, { status: 500 });
  }
}
