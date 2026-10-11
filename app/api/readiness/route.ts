
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

export async function GET() {
  const started = Date.now();

  try {
    await connectDB();

    return NextResponse.json({
      ok: true,
      database: "connected",
      uptimeMs: Date.now() - started,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        database: "disconnected",
        error: error?.message || "database unavailable"
      },
      { status: 503 }
    );
  }
}