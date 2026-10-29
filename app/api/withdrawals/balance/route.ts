import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Wallet from "@/models/Wallet";
import DepositBalance from "@/models/DepositBalance";
import UserPackage from "@/models/UserPackage";

const round8 = (value: number) =>
  Math.round((value + Number.EPSILON) * 1e8) / 1e8;

/**
 * Read-only summary for the internal navbar.
 *
 * General withdrawal balance combines available USDT from the live spot wallet
 * and the external-deposit balance. Package earnings remain a separate bucket.
 * Pending withdrawals are excluded because reserved amounts have left available balances.
 * This endpoint only reads balances; the withdrawal API reserves from each source.
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

    const [wallet, depositBalances, packageAccounts] = await Promise.all([
      Wallet.findOne({
        userId: user._id,
        type: "spot",
        mode: "live",
      })
        .select("balances")
        .lean(),
      DepositBalance.find({ userId: user._id })
        .select("asset available")
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
    const depositAvailable = round8(
      depositBalances.reduce((sum: number, balance: any) => {
        if (String(balance.asset || "").trim().toUpperCase() !== "USDT") return sum;
        const available = Number(balance.available || 0);
        return sum + (Number.isFinite(available) && available > 0 ? available : 0);
      }, 0)
    );
    const generalAvailable = round8(walletAvailable + depositAvailable);

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
