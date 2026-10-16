import mongoose from "mongoose";
import UserPackage from "@/models/UserPackage";
import WithdrawalRequest from "@/models/WithdrawalRequest";

/**
 * Backward-compatible helper name retained for existing route imports.
 *
 * The activation amount is a withdrawal LIMIT, not withdrawable cash.
 * This helper only classifies older requests into the first-withdrawal phase.
 * It deliberately does not credit invested principal to availableEarnings.
 */
export async function ensurePackagePrincipalWithdrawalCredit(
  userId: mongoose.Types.ObjectId,
  firstWithdrawalPercent: number = 100
) {
  const countedStatuses = ["pending", "approved", "processing", "completed"] as const;
  const percent = Math.max(0, Math.min(100, Number(firstWithdrawalPercent ?? 100)));
  const accounts = await UserPackage.find({ userId })
    .select("_id investedAmount")
    .lean();

  for (const account of accounts as any[]) {
    const packageRows = await WithdrawalRequest.find({
      userId,
      source: "package",
      userPackageId: account._id,
      status: { $in: countedStatuses },
    })
      .select("_id amount isFirstPackageWithdrawal createdAt")
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const firstCap = Math.max(0, Number(account.investedAmount || 0) * percent / 100);
    let alreadyUsed = packageRows
      .filter((row: any) => row.isFirstPackageWithdrawal === true)
      .reduce((sum: number, row: any) => sum + Math.max(0, Number(row.amount || 0)), 0);

    const legacyRowsToClassify: mongoose.Types.ObjectId[] = [];
    for (const row of packageRows as any[]) {
      if (row.isFirstPackageWithdrawal === true || alreadyUsed >= firstCap - 1e-8) continue;
      const amount = Number(row.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      legacyRowsToClassify.push(row._id);
      alreadyUsed += amount;
    }

    if (legacyRowsToClassify.length) {
      await WithdrawalRequest.updateMany(
        {
          _id: { $in: legacyRowsToClassify },
          userId,
          userPackageId: account._id,
          source: "package",
          status: { $in: countedStatuses },
          isFirstPackageWithdrawal: { $ne: true },
        },
        { $set: { isFirstPackageWithdrawal: true } },
      );
    }
  }
}
