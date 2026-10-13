import mongoose from "mongoose";
import Wallet from "@/models/Wallet";
import DepositBalance from "@/models/DepositBalance";
import LedgerEntry from "@/models/LedgerEntry";

export const USDT_ASSET = "USDT" as const;
export const PAYMENT_NETWORKS = [
  { code: "TRC20", label: "TRC (TRC20)" },
  { code: "BEP20", label: "BNB Smart Chain (BEP20)" },
] as const;

export type PaymentNetworkCode = (typeof PAYMENT_NETWORKS)[number]["code"];

export function normalizePaymentNetwork(value: unknown): PaymentNetworkCode | "" {
  const key = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (["TRC", "TRC20", "TRON", "TRONTRC20"].includes(key)) return "TRC20";
  if (["BNB", "BSC", "BEP20", "BNBSMARTCHAIN", "BNBSMARTCHAINBEP20"].includes(key)) return "BEP20";
  return "";
}

const roundAmount = (value: number) =>
  Math.round((value + Number.EPSILON) * 1e8) / 1e8;

function usdtBalances(wallet: any) {
  return (wallet?.balances || []).filter(
    (row: any) => String(row.asset || "").trim().toUpperCase() === USDT_ASSET,
  );
}

async function getLegacyAssetUsdtRate(assetValue: string): Promise<number> {
  const asset = assetValue.trim().toUpperCase();
  if (!asset || asset === "USDT" || asset === "USD") return 1;

  // If a legacy value is a real tradable ticker, use its current USDT quote.
  // Arbitrary labels (for example "صثقصقثص") have no verifiable quote and use
  // the explicitly chosen 1:1 legacy-normalization policy.
  if (!/^[A-Z0-9]{2,20}$/.test(asset)) return 1;
  try {
    const response = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=" + encodeURIComponent(asset + "USDT"),
      { cache: "no-store", signal: AbortSignal.timeout(2500) },
    );
    if (!response.ok) return 1;
    const data = await response.json() as { price?: string | number };
    const price = Number(data?.price);
    return Number.isFinite(price) && price > 0 ? price : 1;
  } catch {
    return 1;
  }
}

/**
 * Move legacy deposit balances into the live spot-USDT wallet used by trading,
 * transfers and package activation. Known market symbols use a live quote;
 * unknown free-text labels use the agreed 1:1 fallback. Rows are zeroed in
 * the same transaction so the migration is idempotent and cannot double-credit.
 */
export async function migrateLegacyDepositBalancesToSpotWallet(
  userId: mongoose.Types.ObjectId,
): Promise<void> {
  const initialRows = await DepositBalance.find({
    userId,
    $or: [{ available: { $gt: 0 } }, { locked: { $gt: 0 } }],
  }).select("asset available locked").lean();
  if (!initialRows.length) return;

  const assets = Array.from(new Set(initialRows.map(
    (row: any) => String(row.asset || "").trim().toUpperCase() || "UNKNOWN",
  )));
  const rateEntries = await Promise.all(
    assets.map(async (asset) => [asset, await getLegacyAssetUsdtRate(asset)] as const),
  );
  const rates = new Map<string, number>(rateEntries);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const rows = await DepositBalance.find({
        userId,
        $or: [{ available: { $gt: 0 } }, { locked: { $gt: 0 } }],
      })
        .sort({ createdAt: 1, _id: 1 })
        .session(session);
      if (!rows.length) return;

      const groups = new Map<string, { available: number; locked: number; rate: number }>();
      for (const row of rows) {
        const sourceAsset = String(row.asset || "").trim().toUpperCase() || "UNKNOWN";
        const rate = rates.get(sourceAsset) ?? 1;
        const group = groups.get(sourceAsset) || { available: 0, locked: 0, rate };
        group.available += Math.max(0, Number(row.available || 0));
        group.locked += Math.max(0, Number(row.locked || 0));
        groups.set(sourceAsset, group);
      }

      let availableDelta = 0;
      let lockedDelta = 0;
      for (const group of groups.values()) {
        availableDelta = roundAmount(availableDelta + roundAmount(group.available * group.rate));
        lockedDelta = roundAmount(lockedDelta + roundAmount(group.locked * group.rate));
      }
      if (availableDelta <= 0 && lockedDelta <= 0) return;

      let wallet = await Wallet.findOne({ userId, type: "spot", mode: "live" }).session(session);
      if (!wallet) wallet = new Wallet({ userId, type: "spot", mode: "live", balances: [] });
      const matches = usdtBalances(wallet);
      const beforeAvailable = roundAmount(matches.reduce(
        (sum: number, row: any) => sum + Math.max(0, Number(row.available || 0)), 0,
      ));
      const beforeLocked = roundAmount(matches.reduce(
        (sum: number, row: any) => sum + Math.max(0, Number(row.locked || 0)), 0,
      ));

      if (!matches.length) {
        wallet.balances.push({ asset: USDT_ASSET, available: availableDelta, locked: lockedDelta });
      } else {
        matches[0].available = roundAmount(beforeAvailable + availableDelta);
        matches[0].locked = roundAmount(beforeLocked + lockedDelta);
        for (const extra of matches.slice(1)) { extra.available = 0; extra.locked = 0; }
      }
      await wallet.save({ session });
      await DepositBalance.updateMany(
        { _id: { $in: rows.map((row: any) => row._id) }, userId },
        { $set: { available: 0, locked: 0 } },
        { session },
      );

      let ledgerAvailableBefore = beforeAvailable;
      for (const [sourceAsset, group] of groups) {
        const convertedAvailable = roundAmount(group.available * group.rate);
        const convertedLocked = roundAmount(group.locked * group.rate);
        if (convertedAvailable <= 0) continue;
        const ledgerAvailableAfter = roundAmount(ledgerAvailableBefore + convertedAvailable);
        await LedgerEntry.create([{
          userId, scope: "user", asset: USDT_ASSET, mode: "live", type: "adjustment",
          amount: convertedAvailable,
          balanceBefore: ledgerAvailableBefore,
          balanceAfter: ledgerAvailableAfter,
          referenceId: "legacy-deposit-migration:" + String(userId) + ":" + sourceAsset,
          note: "توحيد رصيد إيداع قديم من " + sourceAsset + " إلى USDT؛ سعر التحويل " + group.rate +
            (convertedLocked > 0 ? "، ورصيد محجوز محوّل " + convertedLocked + " USDT." : " USDT."),
        }], { session });
        ledgerAvailableBefore = ledgerAvailableAfter;
      }
    });
  } finally {
    await session.endSession();
  }
}

export async function creditSpotUsdtBalance(
  userId: mongoose.Types.ObjectId,
  amount: number,
  session: mongoose.ClientSession,
): Promise<{ availableBefore: number; availableAfter: number }> {
  const credit = roundAmount(Number(amount));
  if (!Number.isFinite(credit) || credit <= 0) throw new Error("INVALID_USDT_CREDIT");

  let wallet = await Wallet.findOne({
    userId,
    type: "spot",
    mode: "live",
  }).session(session);

  if (!wallet) {
    wallet = new Wallet({ userId, type: "spot", mode: "live", balances: [] });
  }

  const matches = usdtBalances(wallet);
  const availableBefore = roundAmount(
    matches.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.available || 0)), 0),
  );
  const lockedBefore = roundAmount(
    matches.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.locked || 0)), 0),
  );

  if (!matches.length) {
    wallet.balances.push({ asset: USDT_ASSET, available: credit, locked: 0 });
  } else {
    matches[0].available = roundAmount(availableBefore + credit);
    matches[0].locked = lockedBefore;
    for (const extra of matches.slice(1)) {
      extra.available = 0;
      extra.locked = 0;
    }
  }

  await wallet.save({ session });
  return { availableBefore, availableAfter: roundAmount(availableBefore + credit) };
}

export async function debitSpotUsdtBalance(
  userId: mongoose.Types.ObjectId,
  amount: number,
  session: mongoose.ClientSession,
): Promise<{ ok: boolean; availableBefore: number; availableAfter: number }> {
  const requested = roundAmount(Number(amount));
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, availableBefore: 0, availableAfter: 0 };
  }

  const wallet = await Wallet.findOne({
    userId,
    type: "spot",
    mode: "live",
  }).session(session);

  const matches = usdtBalances(wallet);
  const availableBefore = roundAmount(
    matches.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.available || 0)), 0),
  );
  if (!wallet || availableBefore + 1e-8 < requested) {
    return { ok: false, availableBefore, availableAfter: availableBefore };
  }

  let remaining = requested;
  for (const row of matches) {
    if (remaining <= 0) break;
    const available = roundAmount(Math.max(0, Number(row.available || 0)));
    const debit = roundAmount(Math.min(available, remaining));
    if (debit <= 0) continue;
    row.available = roundAmount(available - debit);
    remaining = roundAmount(remaining - debit);
  }

  if (remaining > 1e-8) throw new Error("USDT_BALANCE_CHANGED");
  await wallet.save({ session });
  return { ok: true, availableBefore, availableAfter: roundAmount(availableBefore - requested) };
}
