import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Wallet from "@/models/Wallet";
import UserPackage from "@/models/UserPackage";

const round8 = (value: number) =>
  Math.round((value + Number.EPSILON) * 1e8) / 1e8;

/**
 * Read-only summary for the internal navbar.
 *
 * The withdrawal balance is intentionally sourced ONLY from:
 * - available USDT in the live spot wallet (general withdrawal source)
 * - available USDT earnings held by package accounts
 *
 * Pending withdrawals are excluded automatically because their amounts are
 * already removed from available balances and moved to locked/reserved state.
 * DepositBalance is deliberately not queried or modified by this endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const [wallet, packageAccounts] = await Promise.all([
      Wallet.findOne({
        userId: user._id,
        type: "spot",
        mode: "live",
      })
        .select("balances")
        .lean(),
      UserPackage.find({
        userId: user._id,
        asset: "USDT",
      })
        .select("asset availableEarnings")
        .lean(),
    ]);

    const generalAvailable = round8(
      (wallet?.balances || []).reduce((sum: number, balance: any) => {
        if (String(balance.asset || "").trim().toUpperCase() !== "USDT") {
          return sum;
        }
        const available = Number(balance.available || 0);
        return sum + (Number.isFinite(available) && available > 0 ? available : 0);
      }, 0)
    );

    const packageAvailable = round8(
      packageAccounts.reduce((sum: number, account: any) => {
        const amount = Number(account.availableEarnings || 0);
        return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
      }, 0)
    );

    return NextResponse.json({
      success: true,
      asset: "USDT",
      generalWithdrawalBalance: generalAvailable,
      withdrawalBalance: round8(generalAvailable + packageAvailable),
      breakdown: {
        generalAvailable,
        packageAvailable,
      },
    });
  } catch (error) {
    console.error("WITHDRAWAL BALANCE SUMMARY:", error);
    return NextResponse.json(
      { success: false, message: "تعذر تحميل رصيد السحب" },
      { status: 500 }
    );
  }
}
