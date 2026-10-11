import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getAccount } from "@/lib/binance-client";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    const account = await getAccount();

    return NextResponse.json({
      success: true,
      accountType: account.accountType,
      canTrade: account.canTrade,
      canWithdraw: account.canWithdraw,
      canDeposit: account.canDeposit,
      balances: (account.balances || [])
        .filter(
          (x: any) =>
            Number(x.free) > 0 ||
            Number(x.locked) > 0
        ),
    });
  } catch (error: any) {
    console.error("BINANCE ACCOUNT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر الاتصال بحساب Binance",
      },
      { status: 502 }
    );
  }
}
