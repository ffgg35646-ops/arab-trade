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
  const countedStatuses = ["pending", "approved", "processing", "completed"] as const;
  const percent = Math.max(0, Math.min(100, Number(firstWithdrawalPercent ?? 100)));
  const [uncreditedAccounts, legacyPackageIds] = await Promise.all([
    UserPackage.find({
      userId,
      withdrawablePrincipalCredited: { $ne: true },
    }).select("_id investedAmount packageName asset withdrawablePrincipalCredited").lean(),
    WithdrawalRequest.distinct("userPackageId", {
      userId,
      source: "package",
      isFirstPackageWithdrawal: { $ne: true },
      status: { $in: countedStatuses },
    }),
  ]);
  const alreadyCreditedAccounts = legacyPackageIds.length
    ? await UserPackage.find({
        _id: { $in: legacyPackageIds },
        userId,
        withdrawablePrincipalCredited: true,
      }).select("_id investedAmount packageName asset withdrawablePrincipalCredited").lean()
    : [];
  const accountsById = new Map<string, any>();
  for (const account of [...(uncreditedAccounts as any[]), ...(alreadyCreditedAccounts as any[])]) {
    accountsById.set(String(account._id), account);
  }
  const accounts = [...accountsById.values()];
  if (!accounts.length) return;

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
    const wasAlreadyCredited = account.withdrawablePrincipalCredited === true;
    const credit = wasAlreadyCredited
      ? 0
      : Math.round((remainingFirstAmount + Number.EPSILON) * 1e8) / 1e8;
    const priorMigrationLedger = wasAlreadyCredited && legacyRowsToClassify.length
      ? await PackageLedger.findOne({
          userId,
          userPackageId: account._id,
          type: "activation_withdrawable",
          note: "إتاحة المتبقي من قيمة تفعيل الباقة ضمن حد السحب الأول.",
        }).select("amount").lean()
      : null;
    const excessMigrationCredit = Math.max(
      0,
      Number(priorMigrationLedger?.amount || 0) - remainingFirstAmount
    );

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (!wasAlreadyCredited) {
          const update: Record<string, any> = { $set: { withdrawablePrincipalCredited: true } };
          if (credit > 1e-8) update.$inc = { availableEarnings: credit };
          const migrated = await UserPackage.findOneAndUpdate(
            { _id: account._id, userId, withdrawablePrincipalCredited: { $ne: true } },
            update,
            { new: true, session }
          );
          if (!migrated) return;
        } else if (excessMigrationCredit > 1e-8) {
          const current = await UserPackage.findOne({
            _id: account._id,
            userId,
            withdrawablePrincipalCredited: true,
          }).select("availableEarnings").session(session).lean();
          if (!current) return;
          const correction = Math.min(
            Math.max(0, Number(current.availableEarnings || 0)),
            excessMigrationCredit
          );
          if (correction > 1e-8) {
            const corrected = await UserPackage.findOneAndUpdate(
              {
                _id: account._id,
                userId,
                withdrawablePrincipalCredited: true,
                availableEarnings: { $gte: correction },
              },
              { $inc: { availableEarnings: -correction } },
              { new: true, session }
            );
            if (!corrected) throw new Error("LEGACY_PACKAGE_BALANCE_CHANGED");
            await PackageLedger.create([{
              userId,
              userPackageId: account._id,
              type: "activation_withdrawable",
              asset: account.asset || "USDT",
              amount: -correction,
              note: "تصحيح رصيد مكرر من ترحيل قديم بعد مطابقة طلبات السحب السابقة.",
            }], { session });
          }
        }
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
