import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Wallet from "@/models/Wallet";
import UserPackage from "@/models/UserPackage";
import { separateLegacyDepositsFromSpotWallet } from "@/lib/deposit-balance-source";
import { consolidateFundingWalletIntoSpotWallet } from "@/lib/consolidate-funding-wallet";

const round8 = (value: number) =>
  Math.round((value + Number.EPSILON) * 1e8) / 1e8;

/**
 * Summary for the internal navbar.
 *
 * General withdrawal balance comes only from available USDT in the live spot wallet.
 * External deposits are non-withdrawable and package earnings remain a separate bucket.
 * Legacy wallet balances are normalized before reading, matching the wallet and withdrawal APIs.
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
    await separateLegacyDepositsFromSpotWallet(user._id);
    await consolidateFundingWalletIntoSpotWallet(user._id);

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

    const walletAvailable = round8(
      (wallet?.balances || []).reduce((sum: number, balance: any) => {
        if (String(balance.asset || "").trim().toUpperCase() !== "USDT") {
          return sum;
        }
        const available = Number(balance.available || 0);
        return sum + (Number.isFinite(available) && available > 0 ? available : 0);
      }, 0)
    );
    const generalAvailable = walletAvailable;

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
