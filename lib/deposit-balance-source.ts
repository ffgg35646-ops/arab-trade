import mongoose from "mongoose";
import DepositBalance from "@/models/DepositBalance";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";

type DepositBalanceLike = {
  asset?: unknown;
  available?: unknown;
  locked?: unknown;
};

export type NormalizedDepositBalance = {
  asset: string;
  available: number;
  locked: number;
};

const roundAmount = (value: number) =>
  Math.round((value + Number.EPSILON) * 1e8) / 1e8;

/** Normalize legacy asset formatting and combine duplicate rows for display. */
export function normalizeDepositBalanceRows(
  rows: readonly DepositBalanceLike[],
): NormalizedDepositBalance[] {
  const totals = new Map<string, NormalizedDepositBalance>();

  for (const row of rows) {
    const asset = String(row.asset ?? "").trim().toUpperCase();
    if (!asset) continue;

    const current = totals.get(asset) || { asset, available: 0, locked: 0 };
    current.available = roundAmount(current.available + Math.max(0, Number(row.available || 0)));
    current.locked = roundAmount(current.locked + Math.max(0, Number(row.locked || 0)));
    totals.set(asset, current);
  }

  return Array.from(totals.values()).sort((a, b) => a.asset.localeCompare(b.asset));
}

/**
 * Debit the canonical external-deposit source inside the caller's MongoDB
 * transaction. Legacy asset casing/spacing differences are handled without
 * duplicating deposits into tradable or general wallet balances.
 */
export async function debitDepositBalance(
  userId: mongoose.Types.ObjectId,
  assetCode: string,
  amount: number,
  session: mongoose.ClientSession,
): Promise<{ ok: boolean; availableBefore: number }> {
  const asset = assetCode.trim().toUpperCase();
  const rows = await DepositBalance.find({ userId })
    .sort({ createdAt: 1, _id: 1 })
    .session(session);

  const matching = rows.filter(
    (row) => String(row.asset || "").trim().toUpperCase() === asset,
  );
  const availableBefore = roundAmount(
    matching.reduce((sum, row) => sum + Math.max(0, Number(row.available || 0)), 0),
  );
  const requested = roundAmount(amount);

  if (availableBefore + 1e-8 < requested) {
    return { ok: false, availableBefore };
  }

  let remaining = requested;
  for (const row of matching) {
    if (remaining <= 0) break;
    const available = roundAmount(Math.max(0, Number(row.available || 0)));
    const debit = roundAmount(Math.min(available, remaining));
    if (debit <= 0) continue;

    const result = await DepositBalance.updateOne(
      { _id: row._id, userId, available: { $gte: debit } },
      { $inc: { available: -debit } },
      { session },
    );

    if (result.modifiedCount !== 1) throw new Error("DEPOSIT_BALANCE_CHANGED");
    remaining = roundAmount(remaining - debit);
  }

  if (remaining > 1e-8) throw new Error("DEPOSIT_BALANCE_CHANGED");
  return { ok: true, availableBefore };
}


/** Credit the external-deposit balance, never the general wallet. */
export async function creditDepositBalance(
  userId: mongoose.Types.ObjectId,
  assetCode: string,
  amount: number,
  session: mongoose.ClientSession,
): Promise<{ availableBefore: number; availableAfter: number }> {
  const asset = assetCode.trim().toUpperCase();
  const credit = roundAmount(Number(amount));
  if (!asset || !Number.isFinite(credit) || credit <= 0) {
    throw new Error("INVALID_DEPOSIT_CREDIT");
  }

  const rows = await DepositBalance.find({ userId })
    .sort({ createdAt: 1, _id: 1 })
    .session(session);
  const matching = rows.filter(
    (row) => String(row.asset || "").trim().toUpperCase() === asset,
  );
  const availableBefore = roundAmount(
    matching.reduce((sum, row) => sum + Math.max(0, Number(row.available || 0)), 0),
  );
  const lockedBefore = roundAmount(
    matching.reduce((sum, row) => sum + Math.max(0, Number(row.locked || 0)), 0),
  );

  if (matching.length) {
    const primary = matching[0];
    primary.asset = asset;
    primary.available = roundAmount(availableBefore + credit);
    primary.locked = lockedBefore;
    await primary.save({ session });

    for (const duplicate of matching.slice(1)) {
      duplicate.available = 0;
      duplicate.locked = 0;
      await duplicate.save({ session });
    }
  } else {
    await DepositBalance.create([{
      userId,
      asset,
      available: credit,
      locked: 0,
    }], { session });
  }

  return {
    availableBefore,
    availableAfter: roundAmount(availableBefore + credit),
  };
}

/**
 * One-time, conservative repair for accounts whose deposit balance was
 * temporarily merged into spot. Replay the relevant ledger movements, treat
 * external deposits as a non-withdrawable pool, and move only the remaining
 * available portion from spot back to DepositBalance. Existing locked funds
 * are left in place so any already-locked funds remain unchanged.
 */
export async function separateLegacyDepositsFromSpotWallet(
  userId: mongoose.Types.ObjectId,
): Promise<void> {
  // v3 replays all legacy deposit credits, including credits from before the old cutover date.
  // Previous v1/v2 negative marker entries remain in the ledger and reduce exposure by amounts already separated.
  const marker = "legacy-deposit-separation:v3:" + String(userId);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const alreadySeparated = await LedgerEntry.findOne({
        userId,
        mode: "live",
        referenceId: marker,
      }).session(session).lean();
      if (alreadySeparated) return;

      const entries = await LedgerEntry.find({
        userId,
        mode: "live",
        asset: "USDT",
      })
        .select("type amount referenceId createdAt")
        .sort({ createdAt: 1, _id: 1 })
        .session(session)
        .lean();

      let depositExposure = 0;
      let hasLegacyDepositActivity = false;

      for (const entry of entries as any[]) {
        const amount = Number(entry.amount || 0);
        const referenceId = String(entry.referenceId || "");
        const isSeparateDepositCredit = referenceId.startsWith("external-deposit-balance:");
        const isSeparateDepositSpend = referenceId.startsWith("separate-deposit-spend:");
        if (isSeparateDepositCredit || isSeparateDepositSpend) continue;

        const isLegacyMigrationCredit = referenceId.startsWith("legacy-deposit-migration:");
        // Older approved deposits may predate the source cutover and still be
        // credited to the spot/funding wallet. Current DepositBalance credits
        // were excluded above by their external-deposit-balance reference ID,
        // so every other positive deposit ledger entry is legacy wallet credit.
        const isLegacyDepositCredit =
          String(entry.type || "").trim().toLowerCase() === "deposit" && amount > 0;

        if (isLegacyMigrationCredit || isLegacyDepositCredit) {
          hasLegacyDepositActivity = true;
          if (amount > 0) depositExposure = roundAmount(depositExposure + amount);
          continue;
        }

        // A transfer between spot and funding is not a spend; preserve its source.
        if (String(entry.type || "") === "transfer") continue;

        // Spending consumes external-deposit funds first. Positive internal
        // rewards/trading credits stay in the withdrawable pool.
        if (amount < 0 && depositExposure > 0) {
          depositExposure = roundAmount(Math.max(0, depositExposure + amount));
        }
      }

      if (!hasLegacyDepositActivity) return;

      const wallets = await Wallet.find({
        userId,
        type: { $in: ["spot", "funding"] },
        mode: "live",
      }).session(session);

      const walletRows = wallets
        .map((wallet: any) => ({
          wallet,
          rows: (wallet.balances || []).filter(
            (row: any) => String(row.asset || "").trim().toUpperCase() === "USDT",
          ),
        }))
        // Use spot first, then funding, so the general spot account is normalized
        // consistently while still protecting funds transferred to funding.
        .sort((a: any, b: any) => (a.wallet.type === "spot" ? 0 : 1) - (b.wallet.type === "spot" ? 0 : 1));

      const availableBefore = roundAmount(
        walletRows.reduce(
          (sum: number, item: any) => sum + item.rows.reduce(
            (rowSum: number, row: any) => rowSum + Math.max(0, Number(row.available || 0)),
            0,
          ),
          0,
        ),
      );
      const lockedTotal = roundAmount(
        walletRows.reduce(
          (sum: number, item: any) => sum + item.rows.reduce(
            (rowSum: number, row: any) => rowSum + Math.max(0, Number(row.locked || 0)),
            0,
          ),
          0,
        ),
      );

      // Locked trading/funding funds may be restored later. Wait for them to
      // unlock before marking legacy deposits as reconciled.
      if (lockedTotal > 1e-8) return;

      const moveAmount = roundAmount(Math.min(depositExposure, availableBefore));

      if (moveAmount > 0 && walletRows.length > 0) {
        await creditDepositBalance(userId, "USDT", moveAmount, session);

        let remaining = moveAmount;
        for (const item of walletRows) {
          if (remaining <= 1e-8) break;
          for (const row of item.rows) {
            if (remaining <= 1e-8) break;
            const available = roundAmount(Math.max(0, Number(row.available || 0)));
            const debit = roundAmount(Math.min(available, remaining));
            if (debit <= 0) continue;
            row.available = roundAmount(available - debit);
            remaining = roundAmount(remaining - debit);
          }
          await item.wallet.save({ session });
        }
        if (remaining > 1e-8) throw new Error("LEGACY_DEPOSIT_SEPARATION_RACE");
      }

      await LedgerEntry.create([{
        userId,
        scope: "user",
        asset: "USDT",
        mode: "live",
        type: "adjustment",
        amount: -moveAmount,
        balanceBefore: availableBefore,
        balanceAfter: roundAmount(availableBefore - moveAmount),
        referenceId: marker,
        note: moveAmount > 0
          ? "فصل الرصيد المتبقي من الإيداعات الخارجية القديمة عن أرصدة السحب العامة."
          : "تمت مراجعة رصيد الإيداعات القديمة؛ لا يوجد مبلغ متاح للنقل من المحافظ العامة.",
      }], { session });
    });
  } finally {
    await session.endSession();
  }
}
