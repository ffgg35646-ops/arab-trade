
import { Types } from "mongoose";
import WalletModel from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";

type WalletType = "spot" | "funding";

export async function adjustWallet(
  userId: Types.ObjectId | string,
  asset: string,
  availableDelta: number,
  lockedDelta = 0,
  type = "adjustment",
  reference = "SYSTEM",
  note = ""
) {
  const uid = new Types.ObjectId(userId);
  const sym = asset.toUpperCase();

  let wallet = await WalletModel.findOne({ userId: uid, type: "spot" as WalletType });

  if (!wallet) {
    wallet = await WalletModel.create({
      userId: uid,
      type: "spot",
      mode: "live",
      balances: []
    });
  }

  const index = wallet.balances.findIndex((b: any) => b.asset === sym);

  if (index === -1) {
    if (availableDelta < 0 || lockedDelta < 0) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    wallet.balances.push({
      asset: sym,
      available: availableDelta,
      locked: lockedDelta
    });
  } else {
    const nextAvailable =
      Number(wallet.balances[index].available || 0) + availableDelta;
    const nextLocked =
      Number(wallet.balances[index].locked || 0) + lockedDelta;

    if (nextAvailable < -1e-12 || nextLocked < -1e-12) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    wallet.balances[index].available = Math.max(0, nextAvailable);
    wallet.balances[index].locked = Math.max(0, nextLocked);
  }

  await wallet.save();

  await LedgerEntry.create({
    userId: uid,
    asset: sym,
    amount: availableDelta,
    type: type as "fee" | "referral" | "withdrawal" | "deposit" | "trade" | "reward" | "adjustment" | "transfer",
    referenceId: reference,
    note
  });

  return wallet;
}