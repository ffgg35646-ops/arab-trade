import mongoose from "mongoose";
import DepositBalance from "@/models/DepositBalance";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";
import WithdrawalRequest from "@/models/WithdrawalRequest";

const LEGACY_UNIFIED_DEPOSIT_CUTOVER_AT = new Date("2026-10-13T09:42:10.000Z").getTime();

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


/** Credit the external-deposit balance, never the general withdrawal wallet. */
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
 * are left in place so any already-pending withdrawal can settle normally.
 */
export async function separateLegacyDepositsFromSpotWallet(
  userId: mongoose.Types.ObjectId,
): Promise<void> {
  const marker = "legacy-deposit-separation:" + String(userId);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const alreadySeparated = await LedgerEntry.findOne({
        userId,
        mode: "live",
        referenceId: marker,
      }).session(session).lean();
      if (alreadySeparated) return;

      // Do not rebalance a wallet while a general withdrawal has an amount
      // locked in it. If that request is later rejected, its original wallet
      // allocation must be returned before legacy deposits are moved out.
      const openGeneralWithdrawal = await WithdrawalRequest.findOne({
        userId,
        source: { $ne: "package" },
        status: { $in: ["pending", "approved", "processing"] },
      }).session(session).select("_id").lean();
      if (openGeneralWithdrawal) return;

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
        const isLegacyMigrationCredit = referenceId.startsWith("legacy-deposit-migration:");
        const isPostCutoverDeposit = String(entry.type || "") === "deposit" &&
          new Date(entry.createdAt).getTime() >= LEGACY_UNIFIED_DEPOSIT_CUTOVER_AT;

        if (isLegacyMigrationCredit || isPostCutoverDeposit) {
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

      const wallet = await Wallet.findOne({
        userId,
        type: "spot",
        mode: "live",
      }).session(session);

      const usdtRows = (wallet?.balances || []).filter(
        (row: any) => String(row.asset || "").trim().toUpperCase() === "USDT",
      );
      const availableBefore = roundAmount(
        usdtRows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.available || 0)), 0),
      );
      const moveAmount = roundAmount(Math.min(depositExposure, availableBefore));

      if (moveAmount > 0 && wallet) {
        await creditDepositBalance(userId, "USDT", moveAmount, session);

        let remaining = moveAmount;
        for (const row of usdtRows) {
          if (remaining <= 0) break;
          const available = roundAmount(Math.max(0, Number(row.available || 0)));
          const debit = roundAmount(Math.min(available, remaining));
          if (debit <= 0) continue;
          row.available = roundAmount(available - debit);
          remaining = roundAmount(remaining - debit);
        }
        if (remaining > 1e-8) throw new Error("LEGACY_DEPOSIT_SEPARATION_RACE");
        await wallet.save({ session });
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
          ? "فصل الرصيد المتبقي من الإيداعات الخارجية القديمة عن رصيد السحب العام."
          : "تمت مراجعة رصيد الإيداعات القديمة؛ لا يوجد مبلغ متاح للنقل من المحفظة العامة.",
      }], { session });
    });
  } finally {
    await session.endSession();
  }
}
