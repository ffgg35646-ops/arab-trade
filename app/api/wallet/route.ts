import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";

const BINANCE_API = "https://api.binance.com";

type NormalizedBalance = {
  asset: string;
  available: number;
  locked: number;
  total: number;
  priceUsd: number;
  valueUsd: number;
};

async function getUsdPrice(asset: string): Promise<number> {
  const symbol = asset.toUpperCase();

  // USDT is our USD display unit.
  if (symbol === "USDT" || symbol === "USD") {
    return 1;
  }

  try {
    const response = await fetch(
      `${BINANCE_API}/api/v3/ticker/price?symbol=${symbol}USDT`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      return 0;
    }

    const data = await response.json();
    const price = Number(data?.price);

    return Number.isFinite(price) && price >= 0 ? price : 0;
  } catch {
    return 0;
  }
}

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

    const wallets = await Wallet.find({
      userId: user._id,
      type: {
        $in: ["spot", "funding"],
      },
    })
      .sort({ type: 1 })
      .lean();

    const spot = wallets.find(
      (wallet: any) => wallet.type === "spot"
    );

    const funding = wallets.find(
      (wallet: any) => wallet.type === "funding"
    );

    function getRawBalances(wallet: any) {
      if (
        !wallet ||
        !Array.isArray(wallet.balances)
      ) {
        return [];
      }

      return wallet.balances
        .map((balance: any) => {
          const available = Number(
            balance.available || 0
          );

          const locked = Number(
            balance.locked || 0
          );

          return {
            asset: String(
              balance.asset || ""
            ).toUpperCase(),

            available,
            locked,

            total: available + locked,
          };
        })
        .filter(
          (item: any) =>
            item.asset &&
            (
              item.available !== 0 ||
              item.locked !== 0
            )
        );
    }

    const rawSpotBalances =
      getRawBalances(spot);

    const rawFundingBalances =
      getRawBalances(funding);

    /*
     * Get USD prices for every asset that actually
     * exists in the user's wallet.
     *
     * Example:
     * BTC  -> BTCUSDT
     * LTC  -> LTCUSDT
     * USDT -> 1
     */
    const uniqueAssets = Array.from(
      new Set(
        [
          ...rawSpotBalances,
          ...rawFundingBalances,
        ].map((item: any) => item.asset)
      )
    );

    const priceEntries =
      await Promise.all(
        uniqueAssets.map(
          async (asset) => [
            asset,
            await getUsdPrice(asset),
          ] as const
        )
      );

    const prices = new Map(
      priceEntries
    );

    function addUsdValues(
      balances: any[]
    ): NormalizedBalance[] {
      return balances.map(
        (item: any) => {
          const priceUsd =
            Number(
              prices.get(item.asset) || 0
            );

          const valueUsd =
            item.total * priceUsd;

          return {
            ...item,
            priceUsd,
            valueUsd,
          };
        }
      );
    }

    const spotBalances =
      addUsdValues(
        rawSpotBalances
      );

    const fundingBalances =
      addUsdValues(
        rawFundingBalances
      );

    /*
     * IMPORTANT:
     * Never sum BTC + LTC + USDT directly.
     *
     * All totals below are USD values.
     */
    const totalAvailableUsd =
      spotBalances.reduce(
        (sum, item) =>
          sum +
          item.available *
            item.priceUsd,
        0
      );

    const totalLockedUsd =
      spotBalances.reduce(
        (sum, item) =>
          sum +
          item.locked *
            item.priceUsd,
        0
      );

    const totalBalanceUsd =
      totalAvailableUsd +
      totalLockedUsd;

    const ledgerEntries = await LedgerEntry.find({
      userId: user._id,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const transactions = ledgerEntries.map((entry: any) => {
      const asset = String(entry.asset || "").toUpperCase();
      const amount = Number(entry.amount || 0);
      const priceUsd = Number(prices.get(asset) || 0);

      return {
        id: String(entry._id),
        type: String(entry.type || "adjustment"),
        amount,
        asset,
        priceUsd,
        valueUsd: Math.abs(amount) * priceUsd,
        balanceBefore: null,
        balanceAfter: null,
        status: "completed",
        description: String(entry.note || ""),
        createdAt: entry.createdAt,
      };
    });

    const fundingTotalUsd =
      fundingBalances.reduce(
        (sum, item) =>
          sum + item.valueUsd,
        0
      );

    return NextResponse.json({
      success: true,

      wallet: {
        type: "spot",

        balances: spotBalances,

        // Backward-compatible names.
        // These totals are now USD values.
        totalAvailable:
          totalAvailableUsd,

        totalLocked:
          totalLockedUsd,

        totalBalance:
          totalBalanceUsd,

        totalAvailableUsd,
        totalLockedUsd,
        totalBalanceUsd,
      },

      spot: {
        balances: spotBalances,

        totalAvailable:
          totalAvailableUsd,

        totalLocked:
          totalLockedUsd,

        totalBalance:
          totalBalanceUsd,

        totalAvailableUsd,
        totalLockedUsd,
        totalBalanceUsd,
      },

      funding: {
        balances:
          fundingBalances,

        totalBalance:
          fundingTotalUsd,

        totalBalanceUsd:
          fundingTotalUsd,
      },

      transactions,
    });
  } catch (error: any) {
    console.error(
      "WALLET GET ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر تحميل بيانات المحفظة",
      },
      { status: 500 }
    );
  }
}
