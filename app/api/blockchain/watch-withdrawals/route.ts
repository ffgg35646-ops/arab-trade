import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { watchPendingWithdrawals } from "@/lib/blockchain-watchers";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export async function POST(
  request: NextRequest
) {
  const cronSecret =
    process.env.CRON_SECRET?.trim();

  // Security requirement:
  // watcher must never be publicly callable without a secret.
  if (!cronSecret) {
    console.error(
      "Blockchain watcher blocked: CRON_SECRET is not configured"
    );

    return NextResponse.json(
      {
        success: false,
        message: "Watcher is not configured",
      },
      { status: 503 }
    );
  }

  const received =
    request.headers.get("x-cron-secret")?.trim() || "";

  if (!received || !safeEqual(received, cronSecret)) {
    return NextResponse.json(
      {
        success: false,
        message: "Unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    const result =
      await watchPendingWithdrawals();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Blockchain withdrawal watcher error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Watcher failed",
      },
      { status: 500 }
    );
  }
}
