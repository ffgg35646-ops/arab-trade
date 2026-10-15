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
  const liveWithdrawal = await WithdrawalRequest.exists({
    userId,
    source: "package",
    status: { $in: ["pending", "processing"] },
  });
  if (liveWithdrawal) return;

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
  const stillUnsettledApproved = await WithdrawalRequest.exists({
    userId,
    source: "package",
    status: "approved",
    packageBalanceSettled: { $ne: true },
  });
  if (stillUnsettledApproved) return;

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

}
