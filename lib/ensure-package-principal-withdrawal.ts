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
  const migrationLedgerNote = "إتاحة المتبقي من قيمة تفعيل الباقة ضمن حد السحب الأول.";
  const migrationCorrectionNote = "تصحيح رصيد مكرر من ترحيل قديم بعد مطابقة طلبات السحب السابقة.";
  const undercreditCorrectionPrefix = "تصحيح نقص رصيد ترحيل قديم بعد تسوية سحب كان معلقًا وقت الترحيل.";
  const accountFields = "_id investedAmount packageName asset withdrawablePrincipalCredited cancellationRefund totalRealizedEarnings totalWithdrawn availableEarnings lockedEarnings";
  const [uncreditedAccounts, legacyPackageIds, migratedPackageIds] = await Promise.all([
    UserPackage.find({
      userId,
      withdrawablePrincipalCredited: { $ne: true },
    }).select(accountFields).lean(),
    WithdrawalRequest.distinct("userPackageId", {
      userId,
      source: "package",
      isFirstPackageWithdrawal: { $ne: true },
      status: { $in: countedStatuses },
    }),
    PackageLedger.distinct("userPackageId", {
      userId,
      type: "activation_withdrawable",
      note: migrationLedgerNote,
    }),
  ]);
  // Revisit accounts with an earlier migration credit even when the old
  // withdrawal was already classified as a first-stage withdrawal.
  const relevantLegacyIds = new Map<string, any>();
  for (const id of [...(legacyPackageIds as any[]), ...(migratedPackageIds as any[])]) {
    if (id) relevantLegacyIds.set(String(id), id);
  }
  const relevantLegacyPackageIds = [...relevantLegacyIds.values()];
  const alreadyCreditedAccounts = relevantLegacyPackageIds.length
    ? await UserPackage.find({
        _id: { $in: relevantLegacyPackageIds },
        userId,
        withdrawablePrincipalCredited: true,
      }).select(accountFields).lean()
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
    }).select("_id amount isFirstPackageWithdrawal status createdAt updatedAt").sort({ createdAt: 1, _id: 1 }).lean();
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
    const priorMigrationLedger = wasAlreadyCredited
      ? await PackageLedger.findOne({
          userId,
          userPackageId: account._id,
          type: "activation_withdrawable",
          note: migrationLedgerNote,
        }).sort({ createdAt: 1, _id: 1 }).select("_id amount createdAt").lean()
      : null;
    let excessMigrationCredit = Math.max(
      0,
      Number(priorMigrationLedger?.amount || 0) - remainingFirstAmount
    );
    let protectedPackageCredits = 0;
    const migrationHadExcessCredit = excessMigrationCredit > 1e-8;
    const accountLedgerRows = priorMigrationLedger
      ? await PackageLedger.find({
          userId,
          userPackageId: account._id,
        }).select("_id type amount note createdAt").sort({ createdAt: 1, _id: 1 }).lean()
      : [];
    const alreadyReconciledUndercredit = accountLedgerRows.some(
      (row: any) =>
        row.type === "activation_withdrawable" &&
        String(row.note || "").startsWith(undercreditCorrectionPrefix)
    );
    const undercreditTargets: Array<{ requestId: string; amount: number }> = [];
    let undercreditCapacity = 0;

    // A migration may have excluded an in-flight first withdrawal from the
    // principal top-up. If that request was later approved and its amount was
    // debited again from available funds, restore only the verified shortfall.
    if (
      priorMigrationLedger &&
      !migrationHadExcessCredit &&
      !alreadyReconciledUndercredit &&
      firstCap > Number(priorMigrationLedger.amount || 0) + 1e-8
    ) {
      const migrationAt = new Date(priorMigrationLedger.createdAt || 0).getTime();
      if (Number.isFinite(migrationAt) && migrationAt > 0) {
        for (const row of packageRows as any[]) {
          if (row.isFirstPackageWithdrawal !== true) continue;
          if (!["approved", "completed"].includes(String(row.status))) continue;

          const requestCreatedAt = new Date(row.createdAt || 0).getTime();
          const requestUpdatedAt = new Date(row.updatedAt || 0).getTime();
          const amount = Number(row.amount || 0);
          if (
            !Number.isFinite(amount) ||
            amount <= 1e-8 ||
            !(requestCreatedAt <= migrationAt && requestUpdatedAt > migrationAt)
          ) {
            continue;
          }

          const requestId = String(row._id);
          const hasPostMigrationDebit = accountLedgerRows.some((entry: any) =>
            entry.type === "withdrawal" &&
            Number(entry.amount || 0) < -1e-8 &&
            Math.abs(Number(entry.amount || 0)) + 1e-8 >= amount &&
            new Date(entry.createdAt || 0).getTime() > migrationAt &&
            String(entry.note || "").includes(requestId)
          );
          if (hasPostMigrationDebit) undercreditTargets.push({ requestId, amount });
        }

        const targetedAmount = undercreditTargets.reduce(
          (sum, row) => sum + row.amount,
          0
        );
        undercreditCapacity = Math.min(
          Math.max(0, firstCap - Number(priorMigrationLedger.amount || 0)),
          targetedAmount
        );
      }
    }

    // A legacy correction must only remove duplicated principal. Cancellation
    // refunds, collected earnings, rewards, and returned withdrawals are real
    // credits in the same package bucket and must not be consumed by migration.
    if (priorMigrationLedger && excessMigrationCredit > 1e-8) {
      const packageLedgerRows = accountLedgerRows;

      let passedMigrationCredit = false;
      for (const row of packageLedgerRows as any[]) {
        if (String(row._id) === String(priorMigrationLedger._id)) {
          passedMigrationCredit = true;
          continue;
        }

        const amount = Number(row.amount || 0);
        const type = String(row.type || "");
        const note = String(row.note || "");
        const isMisroutedRefund = type === "cancellation_refund" && /رصيد السحب العام|المحفظة العامة/.test(note);

        if (
          type === "activation_withdrawable" &&
          note === migrationCorrectionNote &&
          amount < -1e-8
        ) {
          // Do not repeat a correction already written by an earlier request.
          excessMigrationCredit = Math.max(0, excessMigrationCredit - Math.abs(amount));
          continue;
        }

        if (!passedMigrationCredit) {
          // Old packages can have legitimate earnings/refunds recorded before
          // the principal migration ran. Keep those credits protected too.
          if (
            amount > 1e-8 &&
            !isMisroutedRefund && ["cancellation_refund", "refund_reclassification", "daily_earning", "realized_earning", "reward", "withdrawal_reversal"].includes(type)
          ) {
            protectedPackageCredits += amount;
          }
          continue;
        }

        if (type === "withdrawal" && amount < -1e-8) {
          // Funds already paid out cannot also be removed as a duplicated
          // migration credit. Consume the correction target before real credits.
          const debit = Math.abs(amount);
          const alreadyConsumedDuplicate = Math.min(excessMigrationCredit, debit);
          excessMigrationCredit = Math.max(0, excessMigrationCredit - alreadyConsumedDuplicate);
          const debitAgainstRealCredits = Math.max(0, debit - alreadyConsumedDuplicate);
          protectedPackageCredits = Math.max(0, protectedPackageCredits - debitAgainstRealCredits);
          continue;
        }

        if (
          amount > 1e-8 &&
          !isMisroutedRefund && ["cancellation_refund", "refund_reclassification", "daily_earning", "realized_earning", "reward", "withdrawal_reversal"].includes(type)
        ) {
          protectedPackageCredits += amount;
        }
      }
    }

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
          const currentAvailable = Math.max(0, Number(current.availableEarnings || 0));
          const protectedAvailable = Math.min(currentAvailable, Math.max(0, protectedPackageCredits));
          const correction = Math.min(
            Math.max(0, currentAvailable - protectedAvailable),
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

        if (
          wasAlreadyCredited &&
          priorMigrationLedger &&
          !migrationHadExcessCredit &&
          undercreditTargets.length &&
          undercreditCapacity > 1e-8
        ) {
          const current = await UserPackage.findOne({
            _id: account._id,
            userId,
            withdrawablePrincipalCredited: true,
          }).select("availableEarnings lockedEarnings cancellationRefund totalRealizedEarnings totalWithdrawn").session(session).lean();

          if (current) {
            const currentAvailable = Math.max(0, Number(current.availableEarnings || 0));
            const currentLocked = Math.max(0, Number(current.lockedEarnings || 0));
            const actualBucketBalance = currentAvailable + currentLocked;
            const expectedBucketBalance = Math.max(
              0,
              firstCap +
                Math.max(0, Number(current.cancellationRefund || 0)) +
                Math.max(0, Number(current.totalRealizedEarnings || 0)) -
                Math.max(0, Number(current.totalWithdrawn || 0))
            );
            const shortfall = Math.max(0, expectedBucketBalance - actualBucketBalance);
            const correction = Math.round(
              (Math.min(undercreditCapacity, shortfall) + Number.EPSILON) * 1e8
            ) / 1e8;

            if (correction > 1e-8) {
              const corrected = await UserPackage.findOneAndUpdate(
                {
                  _id: account._id,
                  userId,
                  withdrawablePrincipalCredited: true,
                  availableEarnings: currentAvailable,
                  lockedEarnings: currentLocked,
                },
                { $inc: { availableEarnings: correction } },
                { new: true, session }
              );
              if (!corrected) throw new Error("LEGACY_PACKAGE_BALANCE_CHANGED");

              await PackageLedger.create([{
                userId,
                userPackageId: account._id,
                type: "activation_withdrawable",
                asset: account.asset || "USDT",
                amount: correction,
                note: undercreditCorrectionPrefix +
                  " حساب الباقة: " + String(account._id) +
                  "؛ طلبات السحب: " + undercreditTargets.map(row => row.requestId).join(","),
              }], { session });
            }
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
