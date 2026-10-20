import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      message: "التداول التجريبي متوقف. استخدم التداول الفوري داخل عرب تريد.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
