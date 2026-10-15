import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";

import WithdrawalRequest from "@/models/WithdrawalRequest";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";
import Notification from "@/models/Notification";
import UserPackage from "@/models/UserPackage";
import PackageLedger from "@/models/PackageLedger";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";
import PlatformSettings from "@/models/PlatformSettings";

function normalizeAsset(
  value: unknown
) {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
}

function normalizePackageName(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export async function GET(
  request: NextRequest
) {
  try {
    await connectDB();

    const admin =
      await requireAdminLeader(
        request
      );

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 403 }
      );
    }

    const url =
      new URL(request.url);

    const status =
      String(
        url.searchParams.get(
          "status"
        ) || ""
      ).trim();

    const limit = Math.min(
      Math.max(
        Number(
          url.searchParams.get(
            "limit"
          ) || 100
        ),
        1
      ),
      500
    );

    const filter: Record<
      string,
      unknown
    > = {};

    if (status) {
      filter.status = status;
    }

    const withdrawals =
      await WithdrawalRequest.find(
        filter
      )
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .populate("userId", "name username email")
        .populate("userPackageId", "packageName")
        .lean();

    return NextResponse.json({
      success: true,
      withdrawals,
    });
  } catch (error) {
    console.error(
      "ADMIN WITHDRAWALS GET:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحميل السحوبات",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest
) {
  try {
    await connectDB();

    const admin =
      await requireAdminLeader(
        request
      );

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 403 }
      );
    }

    const body =
      await request.json().catch(
        () => ({})
      );

    const id =
      String(body.id || "").trim();

    const nextStatus =
      String(
        body.status || ""
      ).trim();

    const adminNote =
      String(
        body.adminNote || ""
      ).trim();

    if (
      !id ||
      ![
        "approved",
        "rejected",
        "completed",
      ].includes(nextStatus)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "بيانات غير صحيحة",
        },
        { status: 400 }
      );
    }

    const withdrawal =
      await WithdrawalRequest.findById(
        id
      );

    if (!withdrawal) {
      return NextResponse.json(
        {
          success: false,
          message:
            "السحب غير موجود",
        },
        { status: 404 }
      );
    }

    const currentStatus =
      withdrawal.status;

    if (
      currentStatus ===
        "completed" ||
      currentStatus ===
        "rejected"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "لا يمكن تعديل هذه العملية",
        },
        { status: 409 }
      );
    }

    if (
      currentStatus ===
        "approved" &&
      nextStatus ===
        "approved"
    ) {
      withdrawal.adminNote =
        adminNote;

      await withdrawal.save();

      return NextResponse.json({
        success: true,
        withdrawal,
      });
    }

    if (
      withdrawal.source === "package" &&
      withdrawal.isFirstPackageWithdrawal === true &&
      ["approved", "completed"].includes(nextStatus) &&
      withdrawal.userPackageId
    ) {
      const packageAccount = await UserPackage.findOne({
        _id: withdrawal.userPackageId,
        userId: withdrawal.userId,
      }).select("investedAmount packageName").lean();

      if (!packageAccount) {
        return NextResponse.json(
          { success: false, message: "حساب الباقة المرتبط بطلب السحب غير موجود." },
          { status: 409 }
        );
      }

      const familyAccounts = await UserPackage.find({ userId: withdrawal.userId })
        .select("_id packageName investedAmount")
        .lean();
      const familyIds = familyAccounts
        .filter((item: any) => normalizePackageName(item.packageName) === normalizePackageName(packageAccount.packageName))
        .map((item: any) => item._id);
      if (!familyIds.some((item: any) => String(item) === String(withdrawal.userPackageId))) {
        familyIds.push(withdrawal.userPackageId);
      }
      const familyInvestedAmount = familyAccounts
        .filter((item: any) => familyIds.some((familyId: any) => String(familyId) === String(item._id)))
        .reduce((sum: number, item: any) => sum + Math.max(0, Number(item.investedAmount || 0)), 0);
      const packageSettings = await PlatformSettings.findOne({ key: "global" }).select("withdrawals.firstPackageWithdrawalPercent").lean();
      const firstPackageWithdrawalPercent = Math.max(0, Math.min(100, Number(packageSettings?.withdrawals?.firstPackageWithdrawalPercent ?? 100)));
      const packageCap = Math.max(0, familyInvestedAmount * firstPackageWithdrawalPercent / 100);
      const eligibleRequests = await WithdrawalRequest.find({
        userId: withdrawal.userId,
        source: "package",
        userPackageId: { $in: familyIds },
        isFirstPackageWithdrawal: true,
        status: { $in: ["pending", "approved", "processing", "completed"] },
      }).select("_id amount createdAt").sort({ createdAt: 1, _id: 1 }).lean();

      let cumulativeBefore = 0;
      let foundTarget = false;
      for (const row of eligibleRequests as any[]) {
        if (String(row._id) === String(withdrawal._id)) {
          foundTarget = true;
          const targetTotal = cumulativeBefore + Number(row.amount || 0);
          if (targetTotal > packageCap + 1e-8) {
            const allowedForThisRequest = Math.max(0, packageCap - cumulativeBefore);
            return NextResponse.json(
              {
                success: false,
                message: `لا يمكن اعتماد هذا الطلب لأنه يتجاوز سقف باقة ${packageAccount.packageName} البالغ ${packageCap} USDT. الطلبات الأقدم تحتسب أولًا؛ المتبقي لهذا الطلب ${allowedForThisRequest} USDT. ارفض الطلب الزائد ثم أعد إرساله بمبلغ لا يتجاوز المتبقي.`,
                packageCap,
                cumulativeBefore,
                allowedForThisRequest,
              },
              { status: 409 }
            );
          }
          break;
        }
        cumulativeBefore += Number(row.amount || 0);
      }

      if (!foundTarget) {
        return NextResponse.json(
          { success: false, message: "تعذر التحقق من ترتيب طلب السحب ضمن سقف الباقة." },
          { status: 409 }
        );
      }
    }

    if (
      withdrawal.source === "package" &&
      withdrawal.isFirstPackageWithdrawal !== true &&
      ["approved", "completed"].includes(nextStatus) &&
      withdrawal.userPackageId
    ) {
      const [settings, referredUsers] = await Promise.all([
        PlatformSettings.findOne({ key: "global" }).lean(),
        User.find({ referredBy: withdrawal.userId }).select("_id").lean(),
      ]);
      const referredIds = referredUsers.map((item: any) => item._id);
      const activeReferralDeposits = referredIds.length
        ? await DepositRequest.aggregate([
            { $match: { userId: { $in: referredIds }, status: "approved", asset: "USDT" } },
            { $group: { _id: "$userId", total: { $sum: "$amount" } } },
          ])
        : [];
      const activeReferralDepositTotal = activeReferralDeposits.reduce(
        (sum: number, row: any) => sum + Number(row.total || 0),
        0
      );
      const referralPercent = Math.max(
        0,
        Math.min(100, Number(settings?.withdrawals?.referralPackageWithdrawalPercent ?? 50))
      );
      const referralCap = activeReferralDepositTotal * referralPercent / 100;
      const otherSecondStageRequests = await WithdrawalRequest.find({
        _id: { $ne: withdrawal._id },
        userId: withdrawal.userId,
        source: "package",
        isFirstPackageWithdrawal: { $ne: true },
        status: { $in: ["pending", "approved", "processing", "completed"] },
      }).select("amount").lean();
      const referralUsedByOtherRequests = otherSecondStageRequests.reduce(
        (sum: number, row: any) => sum + Number(row.amount || 0),
        0
      );
      const allowedForThisRequest = Math.max(0, referralCap - referralUsedByOtherRequests);
      const amount = Number(withdrawal.amount);
      if (amount > allowedForThisRequest + 1e-8) {
        return NextResponse.json(
          {
            success: false,
            message: "لا يمكن اعتماد هذا الطلب؛ حد الإحالات النشطة هو " + referralCap +
              " USDT، والمحجوز أو المستخدم منه " + referralUsedByOtherRequests +
              " USDT، والمتاح لهذا الطلب " + allowedForThisRequest + " USDT.",
            referralCap,
            referralUsedByOtherRequests,
            allowedForThisRequest,
          },
          { status: 409 }
        );
      }
    }

    if (withdrawal.source === "package") {
      if (!withdrawal.userPackageId) {
        return NextResponse.json({ success: false, message: "طلب السحب لا يحتوي على حساب الباقة" }, { status: 409 });
      }

      const amount = Number(withdrawal.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ success: false, message: "قيمة السحب غير صحيحة" }, { status: 409 });
      }
      if (nextStatus === "completed" && currentStatus !== "approved") {
        return NextResponse.json({ success: false, message: "يجب الموافقة على طلب السحب قبل تنفيذ التحويل." }, { status: 409 });
      }

      const rawAllocations = Array.isArray((withdrawal as any).packageAllocations) && (withdrawal as any).packageAllocations.length
        ? (withdrawal as any).packageAllocations
        : [{ userPackageId: withdrawal.userPackageId, amount }];
      const allocations: Array<{ userPackageId: mongoose.Types.ObjectId; amount: number }> = rawAllocations.map((item: any) => ({
        userPackageId: item.userPackageId as mongoose.Types.ObjectId,
        amount: Number(item.amount),
      }));
      const allocatedTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
      if (
        allocations.some((item) => !mongoose.Types.ObjectId.isValid(String(item.userPackageId)) || !Number.isFinite(item.amount) || item.amount <= 0) ||
        Math.abs(allocatedTotal - amount) > 1e-7
      ) {
        return NextResponse.json({ success: false, message: "توزيع رصيد الباقة في الطلب غير صحيح؛ لم يتم تغيير أي رصيد." }, { status: 409 });
      }
      const touchedPackageIds = Array.from(new Set([
        String(withdrawal.userPackageId),
        ...allocations.map((item) => String(item.userPackageId)),
      ])).map((value) => new mongoose.Types.ObjectId(value));

      const session = await mongoose.startSession();
      let settledWithdrawal: any = null;
      try {
        await session.withTransaction(async () => {
          const updatedRequest = await WithdrawalRequest.findOneAndUpdate(
            { _id: withdrawal._id, status: currentStatus },
            { $set: { status: nextStatus, adminNote, ...(nextStatus === "completed" ? { completedAt: new Date() } : {}) } },
            { new: true, session }
          );
          if (!updatedRequest) throw new Error("WITHDRAWAL_STATUS_CHANGED");

          if (nextStatus === "approved" || nextStatus === "rejected") {
            await User.updateOne(
              { _id: withdrawal.userId },
              { $set: { hasPendingWithdrawal: false } },
              { session }
            );
          }

          if (nextStatus === "approved") {
            await UserPackage.updateMany(
              { _id: { $in: touchedPackageIds }, userId: withdrawal.userId },
              { $set: { withdrawalRequestPending: false } },
              { session }
            );
            if (withdrawal.isFirstPackageWithdrawal) {
              const primaryUpdated = await UserPackage.updateOne(
                { _id: withdrawal.userPackageId, userId: withdrawal.userId },
                { $set: { firstWithdrawalStatus: "approved" } },
                { session }
              );
              if (primaryUpdated.matchedCount !== 1) throw new Error("PACKAGE_BALANCE_INVALID");
            }
          }

          if (nextStatus === "rejected" || nextStatus === "completed") {
            // Rebuild the remaining lock from other live requests instead of
            // blindly subtracting the request amount from a possibly stale field.
            // This lets rejection/completion recover accounts left with an
            // orphaned or under-reported lockedEarnings balance.
            const otherActiveRequests = await WithdrawalRequest.find({
              _id: { $ne: withdrawal._id },
              userId: withdrawal.userId,
              source: "package",
              status: { $in: ["pending", "approved", "processing"] },
            }).select("_id userPackageId packageAllocations amount").session(session).lean();

            const expectedRemainingByPackage = new Map<string, number>();
            for (const activeRequest of otherActiveRequests as any[]) {
              const activeAllocations = Array.isArray(activeRequest.packageAllocations) && activeRequest.packageAllocations.length
                ? activeRequest.packageAllocations
                : [{ userPackageId: activeRequest.userPackageId, amount: activeRequest.amount }];
              for (const activeAllocation of activeAllocations) {
                const packageId = String(activeAllocation.userPackageId || "");
                const allocatedAmount = Number(activeAllocation.amount);
                if (!packageId || !Number.isFinite(allocatedAmount) || allocatedAmount < 0) {
                  throw new Error("PACKAGE_BALANCE_INVALID");
                }
                expectedRemainingByPackage.set(
                  packageId,
                  Number(((expectedRemainingByPackage.get(packageId) || 0) + allocatedAmount).toFixed(8)),
                );
              }
            }

            for (const allocation of allocations) {
              const primary = String(allocation.userPackageId) === String(withdrawal.userPackageId);
              const packageAccount = await UserPackage.findOne({
                _id: allocation.userPackageId,
                userId: withdrawal.userId,
              }).session(session);
              if (!packageAccount) throw new Error("PACKAGE_BALANCE_INVALID");

              const expectedRemaining = expectedRemainingByPackage.get(String(allocation.userPackageId)) || 0;
              const actualLocked = Math.max(0, Number(packageAccount.lockedEarnings || 0));
              // Never consume funds needed by another active request. Any excess
              // lock, however, is returned to available instead of being stranded.
              if (actualLocked + 1e-8 < expectedRemaining) throw new Error("PACKAGE_BALANCE_INVALID");
              const excessLock = Math.max(0, actualLocked - expectedRemaining - allocation.amount);
              const availableCredit = (nextStatus === "rejected" ? allocation.amount : 0) + excessLock;
              const packageSet: Record<string, any> = { lockedEarnings: expectedRemaining };
              const increments: Record<string, any> = {};
              if (availableCredit > 1e-8) increments.availableEarnings = availableCredit;
              if (nextStatus === "completed") increments.totalWithdrawn = allocation.amount;
              const updatedPackage = await UserPackage.findOneAndUpdate(
                { _id: allocation.userPackageId, userId: withdrawal.userId },
                {
                  ...(Object.keys(increments).length ? { $inc: increments } : {}),
                  $set: packageSet,
                },
                { new: true, session }
              );
              if (!updatedPackage) throw new Error("PACKAGE_BALANCE_INVALID");

              await PackageLedger.create([{
                userId: withdrawal.userId,
                userPackageId: updatedPackage._id,
                type: nextStatus === "rejected" ? "withdrawal_reversal" : "withdrawal",
                asset: withdrawal.asset,
                amount: nextStatus === "rejected" ? allocation.amount : -allocation.amount,
                note: adminNote || (nextStatus === "rejected"
                  ? "تم رفض طلب السحب؛ أُعيد مبلغ " + allocation.amount + " " + withdrawal.asset + " إلى رصيد باقة " + updatedPackage.packageName
                  : "تم تنفيذ طلب سحب بقيمة " + allocation.amount + " " + withdrawal.asset + " من رصيد باقة " + updatedPackage.packageName),
                createdBy: admin._id,
              }], { session });

              if (excessLock > 1e-8) {
                await PackageLedger.create([{
                  userId: withdrawal.userId,
                  userPackageId: updatedPackage._id,
                  type: "withdrawal_reversal",
                  asset: withdrawal.asset,
                  amount: excessLock,
                  note: "تصحيح حجز قديم زائد؛ أُعيد " + excessLock + " " + withdrawal.asset + " إلى الرصيد المتاح بعد تسوية طلب السحب " + String(withdrawal._id),
                  createdBy: admin._id,
                }], { session });
              }
            }

            // Keep the family flags aligned with any other still-open request.
            for (const packageId of touchedPackageIds) {
              const remainingForAccount = expectedRemainingByPackage.get(String(packageId)) || 0;
              const flagUpdate: Record<string, any> = {
                withdrawalRequestPending: remainingForAccount > 1e-8,
              };
              if (String(packageId) === String(withdrawal.userPackageId) && withdrawal.isFirstPackageWithdrawal) {
                flagUpdate.firstWithdrawalStatus = nextStatus === "rejected" ? "available" : "completed";
              }
              await UserPackage.updateOne(
                { _id: packageId, userId: withdrawal.userId },
                { $set: flagUpdate },
                { session }
              );
            }
          }
          settledWithdrawal = updatedRequest;
        });
      } catch (settlementError) {
        const code = settlementError instanceof Error ? settlementError.message : "";
        const conflict = code === "WITHDRAWAL_STATUS_CHANGED" || code === "PACKAGE_BALANCE_INVALID";
        console.error("ADMIN PACKAGE WITHDRAWAL SETTLEMENT:", settlementError);
        return NextResponse.json({
          success: false,
          message: conflict
            ? "تغيرت حالة طلب السحب أو رصيد الباقة بالتزامن. حدّث الصفحة وتحقق من الحالة قبل إعادة المحاولة."
            : "تعذر إتمام تسوية سحب الباقة؛ لم يتم اعتماد أي تغيير جزئي في الأرصدة.",
        }, { status: conflict ? 409 : 500 });
      } finally {
        await session.endSession();
      }

      const packageTitle = nextStatus === "rejected"
        ? "تم رفض طلب سحب الباقة"
        : nextStatus === "completed"
          ? "تم تنفيذ سحب الباقة"
          : "تمت الموافقة على سحب الباقة";
      const packageMessage = adminNote || (
        nextStatus === "rejected"
          ? "تم إرجاع المبلغ إلى رصيد السحب المتاح للباقة."
          : nextStatus === "completed"
            ? "تم تنفيذ طلب السحب من رصيد الباقة."
            : "تمت الموافقة على طلب السحب وهو قيد التنفيذ."
      );

      await Notification.create({
        userId: withdrawal.userId,
        type: "withdrawal",
        title: packageTitle,
        message: packageMessage,
        read: false,
      }).catch((notificationError) => {
        console.error("PACKAGE WITHDRAWAL NOTIFICATION:", notificationError);
      });

      return NextResponse.json({ success: true, withdrawal: settledWithdrawal });
    }

    if (nextStatus === "completed" && currentStatus !== "approved") {
      return NextResponse.json({ success: false, message: "يجب الموافقة على طلب السحب قبل تنفيذ التحويل." }, { status: 409 });
    }

    const session = await mongoose.startSession();
    let settledWithdrawal: any = null;
    try {
      await session.withTransaction(async () => {
        const updatedRequest = await WithdrawalRequest.findOneAndUpdate(
          { _id: withdrawal._id, status: currentStatus },
          { $set: { status: nextStatus, adminNote, ...(nextStatus === "completed" ? { completedAt: new Date() } : {}) } },
          { new: true, session }
        );
        if (!updatedRequest) throw new Error("WITHDRAWAL_STATUS_CHANGED");

        if (nextStatus === "approved" || nextStatus === "rejected") {
          await User.updateOne(
            { _id: withdrawal.userId },
            { $set: { hasPendingWithdrawal: false } },
            { session }
          );
        }

        if (nextStatus === "rejected" || nextStatus === "completed") {
          const asset = normalizeAsset(withdrawal.asset);
          const amount = Number(withdrawal.amount);
          if (!Number.isFinite(amount) || amount <= 0) throw new Error("WALLET_BALANCE_INVALID");

          const allocations = Array.isArray(withdrawal.walletAllocations) && withdrawal.walletAllocations.length
            ? withdrawal.walletAllocations
            : [{ walletType: withdrawal.walletType || "spot", amount }];
          const totalAllocated = allocations.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
          if (Math.abs(totalAllocated - amount) > 1e-7) throw new Error("WALLET_BALANCE_INVALID");

          for (const allocation of allocations as any[]) {
            const allocatedAmount = Number(allocation.amount);
            const walletType = allocation.walletType === "funding" ? "funding" : "spot";
            if (!Number.isFinite(allocatedAmount) || allocatedAmount <= 0) throw new Error("WALLET_BALANCE_INVALID");

            const wallet = await Wallet.findOne({
              userId: withdrawal.userId,
              type: walletType,
              mode: "live",
            }).session(session);
            if (!wallet) throw new Error("WALLET_NOT_FOUND");

            const balance = wallet.balances.find((item: any) => normalizeAsset(item.asset) === asset);
            if (!balance || Number(balance.locked || 0) + 1e-12 < allocatedAmount) {
              throw new Error("WALLET_BALANCE_INVALID");
            }

            const availableBefore = Number(balance.available || 0);
            balance.locked = Number(balance.locked || 0) - allocatedAmount;
            if (nextStatus === "rejected") balance.available = availableBefore + allocatedAmount;
            const availableAfter = Number(balance.available || 0);
            await wallet.save({ session });

            await LedgerEntry.create([{
              userId: withdrawal.userId,
              asset,
              type: "withdrawal",
              amount: nextStatus === "rejected" ? allocatedAmount : -allocatedAmount,
              balanceBefore: availableBefore,
              balanceAfter: availableAfter,
              referenceId: String(withdrawal._id),
              note: adminNote || (nextStatus === "rejected"
                ? "تم رفض طلب السحب وإرجاع المبلغ إلى " + (walletType === "funding" ? "محفظة التمويل" : "المحفظة العامة")
                : "تم تنفيذ السحب من " + (walletType === "funding" ? "محفظة التمويل" : "المحفظة العامة")),
            }], { session });
          }
        }
        settledWithdrawal = updatedRequest;
      });
    } catch (settlementError) {
      const code = settlementError instanceof Error ? settlementError.message : "";
      const conflict = ["WITHDRAWAL_STATUS_CHANGED", "WALLET_BALANCE_INVALID", "WALLET_NOT_FOUND"].includes(code);
      console.error("ADMIN WALLET WITHDRAWAL SETTLEMENT:", settlementError);
      return NextResponse.json({
        success: false,
        message: conflict
          ? "تغيرت حالة طلب السحب أو الرصيد بالتزامن. حدّث الصفحة وتحقق من الحالة قبل إعادة المحاولة."
          : "تعذر إتمام تسوية السحب؛ لم يتم اعتماد أي تغيير جزئي في الأرصدة.",
      }, { status: conflict ? 409 : 500 });
    } finally {
      await session.endSession();
    }

    const title =
      nextStatus ===
      "rejected"
        ? "تم رفض طلب السحب"
        : nextStatus ===
          "completed"
        ? "تم تنفيذ السحب"
        : "تمت الموافقة على السحب";

    const message =
      adminNote ||
      (nextStatus ===
      "rejected"
        ? "تم رفض طلب السحب وإرجاع المبلغ إلى رصيدك المتاح."
        : nextStatus ===
          "completed"
        ? "تم تنفيذ طلب السحب."
        : "تمت الموافقة على طلب السحب وهو قيد التنفيذ.");

    await Notification.create({
      userId:
        withdrawal.userId,
      type: "withdrawal",
      title,
      message,
      read: false,
    }).catch((notificationError) => {
      console.error("WITHDRAWAL ADMIN NOTIFICATION:", notificationError);
    });

    return NextResponse.json({
      success: true,
      withdrawal: settledWithdrawal,
    });
  } catch (error) {
    console.error(
      "ADMIN WITHDRAWALS PATCH:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحديث طلب السحب",
      },
      { status: 500 }
    );
  }
}