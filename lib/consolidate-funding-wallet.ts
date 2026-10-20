import mongoose from "mongoose";
import Wallet from "@/models/Wallet";
import Transfer from "@/models/Transfer";
import LedgerEntry from "@/models/LedgerEntry";

const roundAmount = (value: number) =>
  Number(value.toFixed(12));

type WalletRow = {
  asset: string;
  available: number;
  locked: number;
};

/**
 * Retires legacy funding wallets by merging their balances into the user's
 * spot wallet in a single MongoDB transaction. Re-running is safe: the source
 * balances are emptied only in the same transaction that credits spot.
 *
 * Duplicate rows for an asset are combined so later order reservations and
 * general withdrawals can operate on the complete available amount.
 */
export async function consolidateFundingWalletIntoSpotWallet(
  userId: mongoose.Types.ObjectId,
): Promise<void> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // MongoDB transactions must execute operations sequentially on a session.
      const funding = await Wallet.findOne({
        userId,
        type: "funding",
        mode: "live",
      }).session(session);
      const existingSpot = await Wallet.findOne({
        userId,
        type: "spot",
        mode: "live",
      }).session(session);

      const fundingRows = (funding?.balances || []).map((row: any) => ({
        asset: String(row.asset || "").trim().toUpperCase(),
        available: Math.max(0, Number(row.available || 0)),
        locked: Math.max(0, Number(row.locked || 0)),
      })).filter((row: WalletRow) => Boolean(row.asset));

      const spotRows = (existingSpot?.balances || []).map((row: any) => ({
        asset: String(row.asset || "").trim().toUpperCase(),
        available: Math.max(0, Number(row.available || 0)),
        locked: Math.max(0, Number(row.locked || 0)),
      })).filter((row: WalletRow) => Boolean(row.asset));

      const fundingTotals = new Map<string, WalletRow>();
      for (const row of fundingRows) {
        const current = fundingTotals.get(row.asset) || {
          asset: row.asset,
          available: 0,
          locked: 0,
        };
        current.available = roundAmount(current.available + row.available);
        current.locked = roundAmount(current.locked + row.locked);
        fundingTotals.set(row.asset, current);
      }

      const hasFundingValue = Array.from(fundingTotals.values()).some(
        (row) => row.available > 0 || row.locked > 0,
      );
      const hasDuplicateSpotAssets = new Set(spotRows.map((row) => row.asset)).size !== spotRows.length;

      // No source balance and no duplicate spot rows means there is nothing to repair.
      if (!hasFundingValue && !hasDuplicateSpotAssets) return;

      let spot = existingSpot;
      if (!spot) {
        spot = new Wallet({
          userId,
          type: "spot",
          mode: "live",
          balances: [],
        });
      }

      const merged = new Map<string, WalletRow>();
      for (const row of spotRows) {
        const current = merged.get(row.asset) || {
          asset: row.asset,
          available: 0,
          locked: 0,
        };
        current.available = roundAmount(current.available + row.available);
        current.locked = roundAmount(current.locked + row.locked);
        merged.set(row.asset, current);
      }

      for (const row of fundingTotals.values()) {
        const current = merged.get(row.asset) || {
          asset: row.asset,
          available: 0,
          locked: 0,
        };
        current.available = roundAmount(current.available + row.available);
        current.locked = roundAmount(current.locked + row.locked);
        merged.set(row.asset, current);
      }

      const spotBefore = new Map<string, WalletRow>();
      for (const row of spotRows) {
        const current = spotBefore.get(row.asset) || {
          asset: row.asset,
          available: 0,
          locked: 0,
        };
        current.available = roundAmount(current.available + row.available);
        current.locked = roundAmount(current.locked + row.locked);
        spotBefore.set(row.asset, current);
      }

      spot.set("balances", Array.from(merged.values()).sort((a, b) => a.asset.localeCompare(b.asset)));
      await spot.save({ session });

      if (funding && hasFundingValue) {
        funding.set("balances", []);
        await funding.save({ session });

        const transferRows = Array.from(fundingTotals.values()).filter(
          (row) => row.available > 0 || row.locked > 0,
        );

        for (const row of transferRows) {
          const totalMoved = roundAmount(row.available + row.locked);
          if (totalMoved <= 0) continue;

          const [transfer] = await Transfer.create([{
            userId,
            asset: row.asset,
            amount: totalMoved,
            from: "funding",
            to: "spot",
            status: "completed",
          }], { session });

          const before = spotBefore.get(row.asset) || {
            asset: row.asset,
            available: 0,
            locked: 0,
          };
          const referenceId = "FUNDING_CONSOLIDATION:" + String(transfer._id);

          // Ledger entries track spendable amounts; the transfer record captures
          // the full amount moved, including any locked portion.
          if (row.available > 0) {
            await LedgerEntry.create([
              {
                userId,
                scope: "user",
                asset: row.asset,
                mode: "live",
                type: "transfer",
                amount: Number((-row.available).toFixed(12)),
                balanceBefore: row.available,
                balanceAfter: 0,
                referenceId,
                note: "إخراج الرصيد المتاح من محفظة التمويل القديمة أثناء الدمج",
              },
              {
                userId,
                scope: "user",
                asset: row.asset,
                mode: "live",
                type: "transfer",
                amount: Number(row.available.toFixed(12)),
                balanceBefore: before.available,
                balanceAfter: Number((before.available + row.available).toFixed(12)),
                referenceId,
                note: "استلام الرصيد المتاح من محفظة التمويل القديمة في محفظة التداول",
              },
            ], { session, ordered: true });
          }
        }
      }
    });
  } finally {
    await session.endSession();
  }
}
