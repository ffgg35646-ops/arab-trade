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
  const liveWithdrawal = await WithdrawalRequest.exists({
    userId,
    $or: [
      { source: "package", status: { $in: ["pending", "processing"] } },
      { source: { $ne: "package" }, status: { $in: ["pending", "approved", "processing"] } },
    ],
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
}
