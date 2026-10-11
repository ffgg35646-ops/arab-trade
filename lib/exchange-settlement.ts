import { Types } from "mongoose";
import Wallet from "@/models/Wallet";
import LedgerEntry, {
  LedgerType,
} from "@/models/LedgerEntry";
import { money } from "@/lib/exchange-math";

export async function getSpotWallet(
  userId: Types.ObjectId | string
) {
  let wallet = await Wallet.findOne({
    userId,
    type: "spot",
  });

  if (!wallet) {
    wallet = await Wallet.create({
      userId,
      type: "spot",
      balances: [],
    });
  }

  return wallet;
}

export function findBalance(
  wallet: any,
  asset: string
) {
  const normalized = asset.toUpperCase();

  return wallet.balances.find(
    (x: any) =>
      String(x.asset).toUpperCase() === normalized
  );
}

export async function credit(
  userId: Types.ObjectId | string,
  asset: string,
  amount: number,
  type: LedgerType,
  referenceId: string,
  note = ""
) {
  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new Error("INVALID_CREDIT");
  }

  const normalizedAsset =
    asset.trim().toUpperCase();

  const wallet =
    await getSpotWallet(userId);

  let balance =
    findBalance(wallet, normalizedAsset);

  let before = 0;

  if (!balance) {
    wallet.balances.push({
      asset: normalizedAsset,
      available: money(amount),
      locked: 0,
    });

    balance =
      wallet.balances[
        wallet.balances.length - 1
      ] as any;
  } else {
    before = Number(
      balance.available || 0
    );

    balance.available = money(
      before + amount
    );
  }

  const after = Number(
    balance.available || 0
  );

  await wallet.save();

  await LedgerEntry.create({
    userId,
    asset: normalizedAsset,
    amount: money(amount),
    type,
    balanceBefore: money(before),
    balanceAfter: money(after),
    referenceId,
    note,
  });

  return wallet;
}

export async function debitAvailable(
  userId: Types.ObjectId | string,
  asset: string,
  amount: number,
  type: LedgerType,
  referenceId: string,
  note = ""
) {
  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new Error("INVALID_DEBIT");
  }

  const normalizedAsset =
    asset.trim().toUpperCase();

  const wallet =
    await getSpotWallet(userId);

  const balance =
    findBalance(wallet, normalizedAsset);

  if (
    !balance ||
    Number(balance.available || 0) + 1e-12 <
      amount
  ) {
    throw new Error(
      "INSUFFICIENT_BALANCE"
    );
  }

  const before =
    Number(balance.available || 0);

  const after =
    money(before - amount);

  balance.available = after;

  await wallet.save();

  await LedgerEntry.create({
    userId,
    asset: normalizedAsset,
    amount: money(-amount),
    type,
    balanceBefore: money(before),
    balanceAfter: money(after),
    referenceId,
    note,
  });

  return wallet;
}

export async function moveAvailableToLocked(
  userId: Types.ObjectId | string,
  asset: string,
  amount: number,
  referenceId: string
) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "INVALID_LOCK_AMOUNT"
    );
  }

  const wallet =
    await getSpotWallet(userId);

  const balance =
    findBalance(wallet, asset);

  if (
    !balance ||
    Number(balance.available || 0) + 1e-12 <
      amount
  ) {
    throw new Error(
      "INSUFFICIENT_BALANCE"
    );
  }

  balance.available = money(
    Number(balance.available || 0) -
      amount
  );

  balance.locked = money(
    Number(balance.locked || 0) +
      amount
  );

  await wallet.save();

  return wallet;
}

export async function unlockToAvailable(
  userId: Types.ObjectId | string,
  asset: string,
  amount: number
) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "INVALID_UNLOCK_AMOUNT"
    );
  }

  const wallet =
    await getSpotWallet(userId);

  const balance =
    findBalance(wallet, asset);

  if (!balance) {
    throw new Error(
      "BALANCE_NOT_FOUND"
    );
  }

  if (
    Number(balance.locked || 0) + 1e-12 <
      amount
  ) {
    throw new Error(
      "INSUFFICIENT_LOCKED_BALANCE"
    );
  }

  balance.locked = money(
    Number(balance.locked || 0) -
      amount
  );

  balance.available = money(
    Number(balance.available || 0) +
      amount
  );

  await wallet.save();

  return wallet;
}

export async function consumeLocked(
  userId: Types.ObjectId | string,
  asset: string,
  amount: number
) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "INVALID_CONSUME_AMOUNT"
    );
  }

  const wallet =
    await getSpotWallet(userId);

  const balance =
    findBalance(wallet, asset);

  if (!balance) {
    throw new Error(
      "BALANCE_NOT_FOUND"
    );
  }

  if (
    Number(balance.locked || 0) + 1e-12 <
      amount
  ) {
    throw new Error(
      "INSUFFICIENT_LOCKED_BALANCE"
    );
  }

  balance.locked = money(
    Number(balance.locked || 0) -
      amount
  );

  await wallet.save();

  return wallet;
}