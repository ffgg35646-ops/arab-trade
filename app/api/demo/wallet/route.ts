
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Wallet from "@/models/Wallet";

const DEMO_START_BALANCE = 10_000;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

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

    let wallet = await Wallet.findOne({
      userId: user._id,
      type: "spot",
      mode: "demo",
    });

    if (!wallet) {
      wallet = await Wallet.create({
        userId: user._id,
        type: "spot",
        mode: "demo",
        balances: [
          {
            asset: "USDT",
            available: DEMO_START_BALANCE,
            locked: 0,
          },
        ],
      });
    }

    const balances = wallet.balances.map((item: any) => {
      const available = Number(item.available || 0);
      const locked = Number(item.locked || 0);

      return {
        asset: String(item.asset || "").toUpperCase(),
        available,
        locked,
        total: available + locked,
      };
    });

    return NextResponse.json({
      success: true,
      mode: "demo",
      startingBalance: DEMO_START_BALANCE,
      wallet: {
        type: "spot",
        mode: "demo",
        balances,
      },
    });
  } catch (error: any) {
    console.error("DEMO WALLET ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر تحميل الحساب التجريبي",
      },
      { status: 500 }
    );
  }
}
