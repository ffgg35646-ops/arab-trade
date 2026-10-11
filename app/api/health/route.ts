
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

export async function GET() {
  try {
    await connectDB();

    return NextResponse.json({
      ok: true,
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        database: "error",
        error: error?.message || "database error"
      },
      { status: 500 }
    );
  }
}