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

function normalizeAsset(
  value: unknown
) {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
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

          if (nextStatus === "rejected" || nextStatus === "completed") {
            const increments = nextStatus === "rejected"
              ? { $inc: { lockedEarnings: -amount, availableEarnings: amount } }
              : { $inc: { lockedEarnings: -amount, totalWithdrawn: amount } };
            const firstWithdrawalUpdate = withdrawal.isFirstPackageWithdrawal
              ? { $set: { firstWithdrawalStatus: nextStatus === "rejected" ? "available" : "completed" } }
              : {};
            const packageAccount = await UserPackage.findOneAndUpdate(
              { _id: withdrawal.userPackageId, userId: withdrawal.userId, lockedEarnings: { $gte: amount } },
              { ...increments, ...firstWithdrawalUpdate },
              { new: true, session }
            );
            if (!packageAccount) throw new Error("PACKAGE_BALANCE_INVALID");

            await PackageLedger.create([{
              userId: withdrawal.userId,
              userPackageId: packageAccount._id,
              type: nextStatus === "rejected" ? "withdrawal_reversal" : "withdrawal",
              asset: withdrawal.asset,
              amount: nextStatus === "rejected" ? amount : -amount,
              note: adminNote || (nextStatus === "rejected"
                ? "تم رفض طلب السحب؛ أُعيد مبلغ الطلب " + amount + " " + withdrawal.asset + " إلى الرصيد المتاح للباقة"
                : "تم تنفيذ طلب سحب من رصيد أرباح الباقة بقيمة " + amount + " " + withdrawal.asset),
              createdBy: admin._id,
            }], { session });
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

        if (nextStatus === "rejected" || nextStatus === "completed") {
          const wallet = await Wallet.findOne({
            userId: withdrawal.userId,
            type: "spot",
          }).session(session);
          if (!wallet) throw new Error("WALLET_NOT_FOUND");

          const asset = normalizeAsset(withdrawal.asset);
          const balance = wallet.balances.find((item: any) => normalizeAsset(item.asset) === asset);
          const amount = Number(withdrawal.amount);
          if (!balance || !Number.isFinite(amount) || amount <= 0 || Number(balance.locked || 0) + 1e-12 < amount) {
            throw new Error("WALLET_BALANCE_INVALID");
          }

          const availableBefore = Number(balance.available || 0);
          balance.locked = Number(balance.locked || 0) - amount;
          if (nextStatus === "rejected") {
            balance.available = availableBefore + amount;
          }
          const availableAfter = Number(balance.available || 0);
          await wallet.save({ session });

          await LedgerEntry.create([{
            userId: withdrawal.userId,
            asset,
            type: "withdrawal",
            amount: nextStatus === "rejected" ? amount : -amount,
            balanceBefore: availableBefore,
            balanceAfter: availableAfter,
            referenceId: String(withdrawal._id),
            note: adminNote || (nextStatus === "rejected"
              ? "تم رفض طلب السحب وإرجاع المبلغ"
              : "تم تنفيذ السحب"),
          }], { session });
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