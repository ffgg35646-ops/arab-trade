import mongoose from "mongoose";
import UserPackage from "@/models/UserPackage";

const DAY_MS = 24 * 60 * 60 * 1000;
const COLLECTION_WINDOW_MS = 30 * 60 * 1000;

/**
 * Expired collection windows are forfeited. Move each account's cycle anchor
 * forward by whole 24-hour periods, without crediting any missed earnings.
 */
export async function normalizeMissedPackageCollectionWindows(options: {
  userId?: mongoose.Types.ObjectId | string;
} = {}) {
  const now = new Date();
  const filter: Record<string, unknown> = { status: "active" };
  if (options.userId) filter.userId = options.userId;

  const accounts = await UserPackage.find(filter)
    .select("_id userId lastProfitAt")
    .lean();

  let advancedAccounts = 0;
  for (const account of accounts as any[]) {
    const rawAnchor = account.lastProfitAt;
    if (!rawAnchor || Number.isNaN(new Date(rawAnchor).getTime())) {
      await UserPackage.updateOne(
        { _id: account._id, userId: account.userId, status: "active", lastProfitAt: rawAnchor ?? null },
        { $set: { lastProfitAt: now } }
      );
      continue;
    }

    const anchor = new Date(rawAnchor);
    const elapsed = now.getTime() - anchor.getTime();
    if (elapsed <= DAY_MS + COLLECTION_WINDOW_MS) continue;

    const cyclesToAdvance = Math.floor((elapsed - COLLECTION_WINDOW_MS) / DAY_MS);
    if (cyclesToAdvance < 1) continue;
    const nextAnchor = new Date(anchor.getTime() + cyclesToAdvance * DAY_MS);
    const updated = await UserPackage.updateOne(
      { _id: account._id, userId: account.userId, status: "active", lastProfitAt: rawAnchor },
      { $set: { lastProfitAt: nextAnchor } }
    );
    if (updated.modifiedCount > 0) advancedAccounts += 1;
  }

  return { advancedAccounts };
}
