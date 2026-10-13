import mongoose from "mongoose";
import DepositBalance from "@/models/DepositBalance";

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
 * duplicating deposits into tradable or withdrawal wallet balances.
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
