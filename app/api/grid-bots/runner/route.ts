import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { connectDB } from "@/lib/mongodb";
import { runAllGridBots } from "@/lib/grid-bot";

function safeEqual(
  a: string,
  b: string
) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(
    left,
    right
  );
}

export async function POST(
  request: NextRequest
) {
  const secret =
    process.env.CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        message:
          "CRON_SECRET is not configured",
      },
      { status: 503 }
    );
  }

  const received =
    request.headers
      .get("x-cron-secret")
      ?.trim() || "";

  if (
    !received ||
    !safeEqual(received, secret)
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "Unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const result =
      await runAllGridBots();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Grid bot runner error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Grid runner failed",
      },
      { status: 500 }
    );
  }
}
