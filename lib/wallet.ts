import mongoose from "mongoose";
import Wallet from "@/models/Wallet";

export async function ensureUserWallet(
  userId: mongoose.Types.ObjectId,
  type: "spot" | "funding"
) {
  let wallet = await Wallet.findOne({ userId, type });

  if (!wallet) {
    wallet = await Wallet.create({
      userId,
      type,
      balances: [],
    });
  }

  return wallet;
}

export async function getBalance(
  userId: mongoose.Types.ObjectId,
  type: "spot" | "funding",
  asset: string
) {
  const wallet = await ensureUserWallet(userId, type);
  const item = wallet.balances.find((b) => b.asset === asset.toUpperCase());

  return {
    available: item?.available ?? 0,
    locked: item?.locked ?? 0,
  };
}