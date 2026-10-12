import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { accrueDuePackageEarnings } from "@/lib/accrue-package-earnings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json(
      { success: false, message: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  if (request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  try {
    await connectDB();
    const result = await accrueDuePackageEarnings({ limit: 10000 });
    return NextResponse.json({
      success: true,
      message: "تمت معالجة استحقاقات أرباح الباقات اليومية.",
      ...result,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("PACKAGE EARNINGS CRON:", error);
    return NextResponse.json(
      { success: false, message: "تعذرت معالجة الأرباح اليومية" },
      { status: 500 }
    );
  }
}
