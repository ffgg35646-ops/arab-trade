import mongoose from "mongoose";
import UserPackage from "@/models/UserPackage";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import PackageLedger from "@/models/PackageLedger";

/**
 * One-time top-up for legacy package accounts: make the remaining first-stage
 * package value available in its own withdrawal bucket. Newly activated packages
 * set the marker directly and cannot be credited twice.
 */
export async function ensurePackagePrincipalWithdrawalCredit(
  userId: mongoose.Types.ObjectId,
  firstWithdrawalPercent: number = 100
) {
  const accounts = await UserPackage.find({
    userId,
    withdrawablePrincipalCredited: { $ne: true },
  }).select("_id investedAmount packageName asset").lean();
  if (!accounts.length) return;

  const countedStatuses = ["pending", "approved", "processing", "completed"] as const;
  const percent = Math.max(0, Math.min(100, Number(firstWithdrawalPercent ?? 100)));

  for (const account of accounts as any[]) {
    const packageRows = await WithdrawalRequest.find({
      userId,
      source: "package",
      userPackageId: account._id,
      status: { $in: countedStatuses },
    }).select("_id amount isFirstPackageWithdrawal createdAt").sort({ createdAt: 1, _id: 1 }).lean();
    const firstCap = Math.max(0, Number(account.investedAmount || 0) * percent / 100);
    let alreadyUsed = packageRows
      .filter((row: any) => row.isFirstPackageWithdrawal === true)
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const legacyRowsToClassify: mongoose.Types.ObjectId[] = [];
    for (const row of packageRows as any[]) {
      if (row.isFirstPackageWithdrawal === true || alreadyUsed >= firstCap - 1e-8) continue;
      legacyRowsToClassify.push(row._id);
      alreadyUsed += Number(row.amount || 0);
    }
    const remainingFirstAmount = Math.max(0, firstCap - alreadyUsed);
    const credit = Math.round((remainingFirstAmount + Number.EPSILON) * 1e8) / 1e8;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const update: Record<string, any> = { $set: { withdrawablePrincipalCredited: true } };
        if (credit > 1e-8) update.$inc = { availableEarnings: credit };
        const migrated = await UserPackage.findOneAndUpdate(
          { _id: account._id, userId, withdrawablePrincipalCredited: { $ne: true } },
          update,
          { new: true, session }
        );
        if (!migrated) return;
        if (legacyRowsToClassify.length) {
          await WithdrawalRequest.updateMany(
            { _id: { $in: legacyRowsToClassify }, userId, userPackageId: account._id, isFirstPackageWithdrawal: { $ne: true } },
            { $set: { isFirstPackageWithdrawal: true } },
            { session }
          );
        }
        if (credit > 1e-8) {
          await PackageLedger.create([{
            userId,
            userPackageId: account._id,
            type: "activation_withdrawable",
            asset: account.asset || "USDT",
            amount: credit,
            note: "إتاحة المتبقي من قيمة تفعيل الباقة ضمن حد السحب الأول.",
          }], { session });
        }
      });
    } finally {
      await session.endSession();
    }
  }
}
