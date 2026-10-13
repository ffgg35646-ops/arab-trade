import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import {
  syncGridOrders,
  getGridLevels,
} from "@/lib/grid-bot";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
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

  const { id } =
    await context.params;

  try {
    const data =
      await getGridLevels(
        id,
        user._id
      );

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "تعذر قراءة مستويات الشبكة",
      },
      { status: 400 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
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

  const { id } =
    await context.params;

  try {
    const result =
      await syncGridOrders(
        id,
        user._id
      );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "تعذر مزامنة أوامر الشبكة",
      },
      { status: 400 }
    );
  }
}
