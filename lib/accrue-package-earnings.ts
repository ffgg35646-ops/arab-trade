import mongoose from "mongoose";
import InvestmentPackage from "@/models/InvestmentPackage";
import UserPackage from "@/models/UserPackage";
import PackageLedger from "@/models/PackageLedger";

const DAY_MS = 24 * 60 * 60 * 1000;
const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

/**
 * Posts one ledger movement for every overdue daily accrual window.
 * Legacy package accounts without lastProfitAt are initialized from now to
 * avoid retroactively crediting profits for periods before this feature existed.
 */
export async function accrueDuePackageEarnings(options: {
  userId?: mongoose.Types.ObjectId | string;
  limit?: number;
} = {}) {
  const now = new Date();
  const filter: Record<string, unknown> = { status: "active" };
  if (options.userId) filter.userId = options.userId;

  const [plans, accounts] = await Promise.all([
    InvestmentPackage.find({}).select("_id dailyProfit").lean(),
    UserPackage.find(filter)
      .select("_id userId packageId packageName asset lastProfitAt activatedAt availableEarnings")
      .sort({ createdAt: 1 })
      .limit(Math.min(Math.max(options.limit || 5000, 1), 10000))
      .lean(),
  ]);

  const profitByPackage = new Map(
    plans.map((plan: any) => [String(plan._id), Math.max(0, Number(plan.dailyProfit || 0))])
  );
  let processedAccounts = 0;
  let creditedAccounts = 0;
  let creditedTotal = 0;

  for (const account of accounts as any[]) {
    const rawAnchor = account.lastProfitAt;
    if (!rawAnchor) {
      await UserPackage.updateOne(
        { _id: account._id, status: "active", lastProfitAt: { $exists: false } },
        { $set: { lastProfitAt: now } }
      );
      continue;
    }

    const anchor = new Date(rawAnchor);
    if (Number.isNaN(anchor.getTime())) {
      await UserPackage.updateOne(
        { _id: account._id, status: "active", lastProfitAt: rawAnchor },
        { $set: { lastProfitAt: now } }
      );
      continue;
    }

    const elapsedDays = Math.floor((now.getTime() - anchor.getTime()) / DAY_MS);
    if (elapsedDays < 1) continue;

    const nextAnchor = new Date(anchor.getTime() + elapsedDays * DAY_MS);
    const dailyProfit = profitByPackage.get(String(account.packageId)) || 0;
    const totalProfit = roundAmount(dailyProfit * elapsedDays);
    const session = await mongoose.startSession();
    let credited = false;

    try {
      await session.withTransaction(async () => {
        const updates: Record<string, unknown> = {
          $set: { lastProfitAt: nextAnchor },
        };
        if (totalProfit > 0) {
          updates.$inc = {
            availableEarnings: totalProfit,
            totalRealizedEarnings: totalProfit,
          };
        }

        const updated = await UserPackage.findOneAndUpdate(
          {
            _id: account._id,
            userId: account.userId,
            status: "active",
            lastProfitAt: anchor,
          },
          updates,
          { new: true, session }
        );
        if (!updated) return;

        if (totalProfit > 0) {
          await PackageLedger.create([{
            userId: account.userId,
            userPackageId: account._id,
            type: "daily_earning",
            asset: account.asset || "USDT",
            amount: totalProfit,
            note: "عائد يومي تلقائي: " + elapsedDays + " يوم × " + dailyProfit + " " + (account.asset || "USDT") + " يوميًا",
          }], { session });
          credited = true;
        }
      });
      processedAccounts += 1;
      if (credited) {
        creditedAccounts += 1;
        creditedTotal += totalProfit;
      }
    } finally {
      await session.endSession();
    }
  }

  return {
    processedAccounts,
    creditedAccounts,
    creditedTotal: roundAmount(creditedTotal),
  };
}
