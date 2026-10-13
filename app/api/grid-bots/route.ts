import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import GridBot from "@/models/GridBot";
import {
  createGridBot,
} from "@/lib/grid-bot";

export async function GET(
  request: NextRequest
) {
  const user =
    await getCurrentUser(request);

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        message: "غير مسجل الدخول",
      },
      { status: 401 }
    );
  }

  await connectDB();

  const mode =
    request.nextUrl.searchParams.get(
      "mode"
    );

  const filter: Record<string, unknown> = {
    userId: user._id,
  };

  if (
    mode === "demo" ||
    mode === "live"
  ) {
    filter.mode = mode;
  }

  const bots = await GridBot.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    success: true,
    bots,
  });
}

export async function POST(
  request: NextRequest
) {
  const user =
    await getCurrentUser(request);

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        message: "غير مسجل الدخول",
      },
      { status: 401 }
    );
  }

  await connectDB();
  await migrateLegacyDepositBalancesToSpotWallet(user._id);

  try {
    const body = await request.json();

    const mode =
      body.mode === "demo"
        ? "demo"
        : "live";

    const bot = await createGridBot({
      userId: user._id,
      mode,
      symbol: String(
        body.symbol || ""
      ),
      lowerPrice: Number(
        body.lowerPrice
      ),
      upperPrice: Number(
        body.upperPrice
      ),
      gridCount: Number(
        body.gridCount
      ),
      quantityPerGrid: Number(
        body.quantityPerGrid
      ),
    });

    return NextResponse.json(
      {
        success: true,
        bot,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "تعذر إنشاء البوت",
      },
      { status: 400 }
    );
  }
}
