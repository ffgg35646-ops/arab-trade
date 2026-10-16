import mongoose from "mongoose";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import UserPackage from "@/models/UserPackage";
import PackageLedger from "@/models/PackageLedger";

/**
 * Older approval handling left approved package withdrawals in lockedEarnings.
 * Under the package workflow, approval is terminal: consume that locked amount
 * once and mark the request as settled. Never auto-repair while another live
 * withdrawal could own any part of the lock.
 */
export async function settleLegacyApprovedPackageWithdrawals(userId: mongoose.Types.ObjectId) {
  // Only an active package withdrawal can share UserPackage.lockedEarnings.
  // General-wallet withdrawals reserve funds in Wallet and must not block package repair.
  const liveRequests = await WithdrawalRequest.find({
    userId,
    source: "package",
    status: { $in: ["pending", "processing"] },
  }).select("userPackageId packageAllocations").lean();
  const livePackageIds = new Set<string>();
  for (const request of liveRequests as any[]) {
    livePackageIds.add(String(request.userPackageId || ""));
    for (const allocation of request.packageAllocations || []) {
      livePackageIds.add(String(allocation.userPackageId || ""));
    }
  }
  const overlapsLiveRequest = (allocations: Array<{ userPackageId: string }>) =>
    allocations.some((allocation) => livePackageIds.has(allocation.userPackageId));

  const requests = await WithdrawalRequest.find({
    userId,
    source: "package",
    status: "approved",
    packageBalanceSettled: { $ne: true },
  }).sort({ createdAt: 1, _id: 1 }).lean();

  for (const request of requests as any[]) {
    const amount = Number(request.amount);
    const rawAllocations = Array.isArray(request.packageAllocations) && request.packageAllocations.length
      ? request.packageAllocations
      : [{ userPackageId: request.userPackageId, amount }];
    const allocations = rawAllocations.map((row: any) => ({
      userPackageId: String(row.userPackageId || ""),
      amount: Number(row.amount),
    }));
    const allocationTotal = allocations.reduce((sum: number, row: any) => sum + row.amount, 0);
    // Another request may own this package's locked funds; repair unrelated
    // historical package accounts without touching its live reservation.
    if (overlapsLiveRequest(allocations)) continue;

    if (
      !Number.isFinite(amount) || amount <= 0 ||
      allocations.some((row: any) => !mongoose.Types.ObjectId.isValid(row.userPackageId) || !Number.isFinite(row.amount) || row.amount <= 0) ||
      Math.abs(allocationTotal - amount) > 1e-7
    ) {
      console.error("PACKAGE APPROVAL LEGACY SETTLEMENT: invalid allocation; left unchanged", String(request._id));
      continue;
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const stillUnsettled = await WithdrawalRequest.findOne({
          _id: request._id,
          userId,
          source: "package",
          status: "approved",
          packageBalanceSettled: { $ne: true },
        }).session(session).lean();
        if (!stillUnsettled) return;

        for (const allocation of allocations) {
          const packageUpdate: Record<string, any> = {
            $inc: {
              lockedEarnings: -allocation.amount,
              totalWithdrawn: allocation.amount,
            },
            $set: { withdrawalRequestPending: false },
          };
          if (
            request.isFirstPackageWithdrawal === true &&
            String(allocation.userPackageId) === String(request.userPackageId)
          ) {
            packageUpdate.$set.firstWithdrawalStatus = "completed";
          }

          const account = await UserPackage.findOneAndUpdate(
            {
              _id: allocation.userPackageId,
              userId,
              lockedEarnings: { $gte: allocation.amount },
            },
            packageUpdate,
            { new: true, session },
          );
          if (!account) throw new Error("APPROVED_PACKAGE_LOCK_MISMATCH");

          await PackageLedger.create([{
            userId,
            userPackageId: account._id,
            type: "withdrawal",
            asset: request.asset || "USDT",
            amount: -allocation.amount,
            note: "تسوية موافقة سحب باقة قديمة؛ تم خصم " + allocation.amount + " " + (request.asset || "USDT") + " من الرصيد المحجوز. رقم الطلب: " + String(request._id),
          }], { session });
        }

        const marked = await WithdrawalRequest.updateOne(
          {
            _id: request._id,
            userId,
            status: "approved",
            packageBalanceSettled: { $ne: true },
          },
          { $set: { packageBalanceSettled: true } },
          { session },
        );
        if (marked.matchedCount !== 1) throw new Error("APPROVED_PACKAGE_REQUEST_CHANGED");
      });
    } catch (error) {
      console.error("PACKAGE APPROVAL LEGACY SETTLEMENT: request left unchanged", String(request._id), error);
    } finally {
      await session.endSession();
    }
  }
  // Older rejection handlers sometimes released the lock without returning the
  // requested amount to availableEarnings. Restore only rejected requests that
  // have no matching reversal ledger entry from the original decision.
  // An approved legacy request that still cannot be reconciled protects only
  // the package accounts it references. Do not block refunds/repairs for other
  // independent package accounts belonging to the same user.
  const remainingUnsettledApproved = await WithdrawalRequest.find({
    userId,
    source: "package",
    status: "approved",
    packageBalanceSettled: { $ne: true },
  }).select("userPackageId packageAllocations").lean();
  for (const request of remainingUnsettledApproved as any[]) {
    livePackageIds.add(String(request.userPackageId || ""));
    for (const allocation of request.packageAllocations || []) {
      livePackageIds.add(String(allocation.userPackageId || ""));
    }
  }

  // Some older deployments set packageBalanceSettled before the locked amount
  // was actually consumed. Repair only when the request is approved and either
  // its allocation is still locked or the old orphan-lock repair credited the
  // same amount back into availableEarnings. A request-specific marker makes
  // this repair idempotent.
  const previouslySettledApproved = await WithdrawalRequest.find({
    userId,
    source: "package",
    status: "approved",
    packageBalanceSettled: true,
  }).sort({ createdAt: 1, _id: 1 }).lean();

  for (const request of previouslySettledApproved as any[]) {
    const requestId = String(request._id);
    const amount = Number(request.amount);
    const rawAllocations = Array.isArray(request.packageAllocations) && request.packageAllocations.length
      ? request.packageAllocations
      : [{ userPackageId: request.userPackageId, amount }];
    const allocations = rawAllocations.map((row: any) => ({
      userPackageId: String(row.userPackageId || ""),
      amount: Number(row.amount),
    }));
    const allocationTotal = allocations.reduce((sum: number, row: any) => sum + row.amount, 0);
    // Another request may own this package's locked funds; repair unrelated
    // historical package accounts without touching its live reservation.
    if (overlapsLiveRequest(allocations)) continue;

    if (
      !Number.isFinite(amount) || amount <= 0 ||
      allocations.some((row: any) => !mongoose.Types.ObjectId.isValid(row.userPackageId) || !Number.isFinite(row.amount) || row.amount <= 0) ||
      Math.abs(allocationTotal - amount) > 1e-7
    ) {
      console.error("PACKAGE APPROVAL BALANCE REPAIR: invalid allocation; left unchanged", requestId);
      continue;
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const stillApproved = await WithdrawalRequest.findOne({
          _id: request._id,
          userId,
          source: "package",
          status: "approved",
          packageBalanceSettled: true,
        }).session(session).lean();
        if (!stillApproved) return;

        for (const allocation of allocations) {
          const packageId = new mongoose.Types.ObjectId(allocation.userPackageId);
          const repairNote = "تصحيح خصم سحب معتمد قديم؛ رقم الطلب: " + requestId + "؛ حساب الباقة: " + allocation.userPackageId;
          const alreadyRepaired = await PackageLedger.exists({
            userId,
            userPackageId: packageId,
            type: "withdrawal",
            note: { $regex: "تصحيح خصم سحب معتمد قديم؛ رقم الطلب: " + requestId + "؛ حساب الباقة: " + allocation.userPackageId },
          }).session(session);
          if (alreadyRepaired) continue;

          const account = await UserPackage.findOne({
            _id: packageId,
            userId,
          }).select("lockedEarnings availableEarnings").session(session).lean();
          if (!account) throw new Error("APPROVED_PACKAGE_ACCOUNT_MISSING");

          const actualLocked = Math.max(0, Number(account.lockedEarnings || 0));
          let updatedPackage: any = null;
          let sourceReversalId = "";

          if (actualLocked + 1e-8 >= allocation.amount) {
            updatedPackage = await UserPackage.findOneAndUpdate(
              {
                _id: packageId,
                userId,
                lockedEarnings: { $gte: allocation.amount },
              },
              {
                $inc: { lockedEarnings: -allocation.amount },
                $set: {
                  withdrawalRequestPending: false,
                  ...(request.isFirstPackageWithdrawal === true && allocation.userPackageId === String(request.userPackageId)
                    ? { firstWithdrawalStatus: "completed" }
                    : {}),
                },
              },
              { new: true, session },
            );
          } else {
            const decisionAt = new Date(request.updatedAt || request.createdAt || Date.now());
            const possibleReturns = await PackageLedger.find({
              userId,
              userPackageId: packageId,
              type: "withdrawal_reversal",
              amount: { $gte: allocation.amount - 1e-7 },
              note: { $regex: "تصحيح حجز سحب قديم: لا يوجد طلب سحب قائم" },
              createdAt: { $gte: new Date(decisionAt.getTime() - 30_000) },
            }).sort({ createdAt: 1, _id: 1 }).session(session).lean();

            for (const returned of possibleReturns as any[]) {
              const priorCorrections = await PackageLedger.find({
                userId,
                userPackageId: packageId,
                type: "withdrawal",
                note: { $regex: "مصدر قيد الإرجاع: " + String(returned._id) },
              }).select("amount").session(session).lean();
              const alreadyConsumed = priorCorrections.reduce(
                (sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)),
                0,
              );
              if (Number(returned.amount || 0) - alreadyConsumed + 1e-8 < allocation.amount) continue;

              updatedPackage = await UserPackage.findOneAndUpdate(
                {
                  _id: packageId,
                  userId,
                  availableEarnings: { $gte: allocation.amount },
                },
                {
                  $inc: { availableEarnings: -allocation.amount },
                  $set: {
                    withdrawalRequestPending: false,
                    ...(request.isFirstPackageWithdrawal === true && allocation.userPackageId === String(request.userPackageId)
                      ? { firstWithdrawalStatus: "completed" }
                      : {}),
                  },
                },
                { new: true, session },
              );
              if (updatedPackage) {
                sourceReversalId = String(returned._id);
                break;
              }
            }
          }

          // No matching locked amount or orphan-return credit: preserve the
          // balance for inspection rather than inventing a deduction.
          if (!updatedPackage) continue;

          await PackageLedger.create([{
            userId,
            userPackageId: packageId,
            type: "withdrawal",
            asset: request.asset || "USDT",
            amount: -allocation.amount,
            note: repairNote + (sourceReversalId ? "؛ مصدر قيد الإرجاع: " + sourceReversalId : ""),
          }], { session });
        }
      });
    } catch (error) {
      console.error("PACKAGE APPROVAL BALANCE REPAIR: request left unchanged", requestId, error);
    } finally {
      await session.endSession();
    }
  }

  const rejectedRequests = await WithdrawalRequest.find({
    userId,
    source: "package",
    status: "rejected",
    packageBalanceSettled: { $ne: true },
  }).sort({ createdAt: 1, _id: 1 }).lean();

  for (const request of rejectedRequests as any[]) {
    const amount = Number(request.amount);
    const rawAllocations = Array.isArray(request.packageAllocations) && request.packageAllocations.length
      ? request.packageAllocations
      : [{ userPackageId: request.userPackageId, amount }];
    const allocations = rawAllocations.map((row: any) => ({
      userPackageId: String(row.userPackageId || ""),
      amount: Number(row.amount),
    }));
    const allocationTotal = allocations.reduce((sum: number, row: any) => sum + row.amount, 0);
    // Another request may own this package's locked funds; repair unrelated
    // historical package accounts without touching its live reservation.
    if (overlapsLiveRequest(allocations)) continue;

    if (
      !Number.isFinite(amount) || amount <= 0 ||
      allocations.some((row: any) => !mongoose.Types.ObjectId.isValid(row.userPackageId) || !Number.isFinite(row.amount) || row.amount <= 0) ||
      Math.abs(allocationTotal - amount) > 1e-7
    ) {
      console.error("PACKAGE REJECTION LEGACY SETTLEMENT: invalid allocation; left unchanged", String(request._id));
      continue;
    }

    const decisionAt = new Date(request.updatedAt || request.createdAt || Date.now());
    const ledgerWindowStart = new Date(decisionAt.getTime() - 30 * 1000);
    const ledgerWindowEnd = new Date(decisionAt.getTime() + 30 * 1000);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const stillUnsettled = await WithdrawalRequest.findOne({
          _id: request._id,
          userId,
          source: "package",
          status: "rejected",
          packageBalanceSettled: { $ne: true },
        }).session(session).lean();
        if (!stillUnsettled) return;

        for (const allocation of allocations) {
          // The old admin flow writes the reversal ledger in the same transaction
          // as the refund. A matching entry means the amount was already restored:
          // mark it migrated without crediting the package twice.
          const existingReversal = await PackageLedger.exists({
            userId,
            userPackageId: new mongoose.Types.ObjectId(allocation.userPackageId),
            type: "withdrawal_reversal",
            amount: {
              $gte: allocation.amount - 1e-7,
              $lte: allocation.amount + 1e-7,
            },
            createdAt: { $gte: ledgerWindowStart, $lte: ledgerWindowEnd },
          }).session(session);
          if (existingReversal) continue;

          const packageAccount = await UserPackage.findOne({
            _id: allocation.userPackageId,
            userId,
          }).session(session);
          if (!packageAccount) throw new Error("REJECTED_PACKAGE_ACCOUNT_MISSING");

          const actualLocked = Math.max(0, Number(packageAccount.lockedEarnings || 0));
          const remainingLocked = Math.max(0, actualLocked - allocation.amount);
          const updatedPackage = await UserPackage.findOneAndUpdate(
            { _id: allocation.userPackageId, userId },
            {
              $inc: { availableEarnings: allocation.amount },
              $set: {
                lockedEarnings: remainingLocked,
                withdrawalRequestPending: false,
                ...(request.isFirstPackageWithdrawal === true &&
                  String(allocation.userPackageId) === String(request.userPackageId)
                  ? { firstWithdrawalStatus: "available" }
                  : {}),
              },
            },
            { new: true, session },
          );
          if (!updatedPackage) throw new Error("REJECTED_PACKAGE_ACCOUNT_MISSING");

          await PackageLedger.create([{
            userId,
            userPackageId: updatedPackage._id,
            type: "withdrawal_reversal",
            asset: request.asset || "USDT",
            amount: allocation.amount,
            note: "تسوية رفض سحب باقة قديم؛ تمت إعادة " + allocation.amount + " " +
              (request.asset || "USDT") + " إلى الرصيد المتاح. رقم الطلب: " + String(request._id),
          }], { session });
        }

        const marked = await WithdrawalRequest.updateOne(
          {
            _id: request._id,
            userId,
            status: "rejected",
            packageBalanceSettled: { $ne: true },
          },
          { $set: { packageBalanceSettled: true } },
          { session },
        );
        if (marked.matchedCount !== 1) throw new Error("REJECTED_PACKAGE_REQUEST_CHANGED");
      });
    } catch (error) {
      console.error("PACKAGE REJECTION LEGACY SETTLEMENT: request left unchanged", String(request._id), error);
    } finally {
      await session.endSession();
    }
  }


  // Reconcile settled historical package withdrawals against the package's
  // real funding sources. Older approval code could mark a payout settled and
  // increment totalWithdrawn while leaving the same amount in availableEarnings.
  // Approved package withdrawals are final in this workflow, so their request
  // records—not a possibly stale counter—define the cumulative amount withdrawn.
  const settledRequestsForBalance = await WithdrawalRequest.find({
    userId,
    source: "package",
    status: { $in: ["approved", "completed"] },
  }).select("_id userPackageId packageAllocations amount").lean();

  const settledAmountByPackage = new Map<string, number>();
  const settledRequestIdsByPackage = new Map<string, string[]>();
  for (const request of settledRequestsForBalance as any[]) {
    const fallbackAmount = Number(request.amount || 0);
    const rows = Array.isArray(request.packageAllocations) && request.packageAllocations.length
      ? request.packageAllocations
      : [{ userPackageId: request.userPackageId, amount: fallbackAmount }];

    for (const allocation of rows as any[]) {
      const packageId = String(allocation.userPackageId || "");
      const amount = Number(allocation.amount);
      if (
        !mongoose.Types.ObjectId.isValid(packageId) ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) continue;

      settledAmountByPackage.set(
        packageId,
        Number(((settledAmountByPackage.get(packageId) || 0) + amount).toFixed(8)),
      );
      const ids = settledRequestIdsByPackage.get(packageId) || [];
      ids.push(String(request._id));
      settledRequestIdsByPackage.set(packageId, ids);
    }
  }

  for (const [packageId, requestTotal] of settledAmountByPackage) {
    // Never repair a bucket while a live/unreconciled request may still own
    // part of its locked amount.
    if (livePackageIds.has(packageId)) continue;

    const account = await UserPackage.findOne({ _id: packageId, userId })
      .select("investedAmount cancellationRefund totalRealizedEarnings totalWithdrawn availableEarnings lockedEarnings")
      .lean();
    if (!account) continue;

    const available = Math.max(0, Number(account.availableEarnings || 0));
    const locked = Math.max(0, Number(account.lockedEarnings || 0));
    const ledgerEarnings = await PackageLedger.find({
      userId,
      userPackageId: new mongoose.Types.ObjectId(packageId),
      type: { $in: ["daily_earning", "realized_earning", "reward"] },
    }).select("type amount").lean();

    let earningLedgerTotal = 0;
    let rewardLedgerTotal = 0;
    for (const row of ledgerEarnings as any[]) {
      const amount = Number(row.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (row.type === "reward") rewardLedgerTotal += amount;
      else earningLedgerTotal += amount;
    }

    // totalRealizedEarnings includes collected earnings; use the ledger as a
    // fallback for releases where a legacy earning write missed that counter.
    const realizedEarnings = Math.max(
      0,
      Number(account.totalRealizedEarnings || 0),
      earningLedgerTotal,
    );
    const expectedBalance = Math.max(
      0,
      Number(account.investedAmount || 0) +
        Math.max(0, Number(account.cancellationRefund || 0)) +
        realizedEarnings +
        rewardLedgerTotal -
        requestTotal,
    );
    const actualBalance = available + locked;
    const excess = Math.max(0, actualBalance - expectedBalance);
    const correctedTotalWithdrawn = Number(requestTotal.toFixed(8));
    const counterNeedsCorrection = Math.abs(
      Number(account.totalWithdrawn || 0) - correctedTotalWithdrawn
    ) > 1e-7;

    if (excess <= 1e-7 && !counterNeedsCorrection) continue;

    // There are no live requests referencing this package, so any remaining
    // lock belongs to a stale settled request. Remove only the excess above the
    // independently recomputed balance and normalize the cumulative counter.
    const removeFromAvailable = Math.min(available, excess);
    const removeFromLocked = Math.min(locked, Math.max(0, excess - removeFromAvailable));
    const corrected = await UserPackage.findOneAndUpdate(
      {
        _id: packageId,
        userId,
        availableEarnings: account.availableEarnings ?? 0,
        lockedEarnings: account.lockedEarnings ?? 0,
        totalWithdrawn: account.totalWithdrawn ?? 0,
      },
      {
        $set: {
          totalWithdrawn: correctedTotalWithdrawn,
          availableEarnings: Math.max(0, available - removeFromAvailable),
          lockedEarnings: Math.max(0, locked - removeFromLocked),
        },
      },
      { new: true },
    );

    if (!corrected) continue;
    const correctedAmount = Number((removeFromAvailable + removeFromLocked).toFixed(8));
    if (correctedAmount > 1e-7) {
      const requestIds = [...new Set(settledRequestIdsByPackage.get(packageId) || [])];
      await PackageLedger.create({
        userId,
        userPackageId: corrected._id,
        type: "withdrawal",
        asset: "USDT",
        amount: -correctedAmount,
        note: "تصحيح الرصيد التراكمي بعد مطابقة السحوبات المعتمدة. الطلبات: " + requestIds.join(", "),
      }).catch((ledgerError) => {
        console.error("PACKAGE CUMULATIVE WITHDRAWAL RECONCILIATION LEDGER:", packageId, ledgerError);
      });
    }
  }

}
