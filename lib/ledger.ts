import mongoose from "mongoose";
import LedgerEntry from "@/models/LedgerEntry";

export async function writeLedger(
  userId: mongoose.Types.ObjectId,
  asset: string,
  type: any,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  referenceId?: string,
  note?: string,
  session?: mongoose.ClientSession
) {
  const entry = {
    userId,
    scope: "user" as const,
    asset: asset.toUpperCase(),
    type,
    amount,
    balanceBefore,
    balanceAfter,
    referenceId: referenceId || "",
    note: note || "",
  };

  return session
    ? LedgerEntry.create([entry], { session }).then((rows) => rows[0])
    : LedgerEntry.create(entry);
}

export async function writeSystemLedger(
  asset: string,
  type: any,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  systemAccount: string,
  referenceId?: string,
  note?: string,
  session?: mongoose.ClientSession
) {
  return LedgerEntry.create(
    [
      {
        scope: "system",
        systemAccount,
        asset: asset.toUpperCase(),
        type,
        amount,
        balanceBefore,
        balanceAfter,
        referenceId: referenceId || "",
        note: note || "",
      },
    ],
    session ? { session } : undefined
  ).then((rows) => rows[0]);
}
