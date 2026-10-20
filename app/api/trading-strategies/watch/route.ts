import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { runUserManualSpotStrategies } from "@/lib/spot-strategies";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
  }

  try {
    await connectDB();
    const result = await runUserManualSpotStrategies(user._id);
    return NextResponse.json({
      success: true,
      message: "تم فحص قواعد الإشارات اليدوية.",
      ...result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("MANUAL SPOT STRATEGY WATCH:", error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "تعذر فحص الإشارات اليدوية",
    }, { status: 502 });
  }
}
