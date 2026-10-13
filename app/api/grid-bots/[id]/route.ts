import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import GridBot from "@/models/GridBot";
import {
  startGridBot,
  stopGridBot,
} from "@/lib/grid-bot";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
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

  const { id } = await context.params;

  const bot = await GridBot.findOne({
    _id: id,
    userId: user._id,
  }).lean();

  if (!bot) {
    return NextResponse.json(
      {
        success: false,
        message: "البوت غير موجود",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    bot,
  });
}

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
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

  const { id } = await context.params;

  try {
    const body = await request.json();
    const action = String(
      body.action || ""
    );

    let bot;

    if (action === "start") {
      bot = await startGridBot(
        id,
        user._id
      );
    } else if (action === "stop") {
      bot = await stopGridBot(
        id,
        user._id
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "إجراء غير صالح",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      bot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "تعذر تنفيذ الإجراء",
      },
      { status: 400 }
    );
  }
}
