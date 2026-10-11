import { NextRequest, NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";

import WithdrawalRequest from "@/models/WithdrawalRequest";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";
import Notification from "@/models/Notification";

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
        .populate(
          "userId",
          "name username email"
        )
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

    const wallet =
      await Wallet.findOne({
        userId:
          withdrawal.userId,
        type: "spot",
      });

    if (!wallet) {
      return NextResponse.json(
        {
          success: false,
          message:
            "محفظة المستخدم غير موجودة",
        },
        { status: 500 }
      );
    }

    const asset =
      normalizeAsset(
        withdrawal.asset
      );

    const balance =
      wallet.balances.find(
        (b: any) =>
          normalizeAsset(
            b.asset
          ) === asset
      );

    const amount =
      Number(
        withdrawal.amount
      );

    if (
      !balance ||
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "بيانات الرصيد غير صحيحة",
        },
        { status: 409 }
      );
    }

    if (
      Number(
        balance.locked || 0
      ) + 1e-12 <
      amount
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "الرصيد المقفل غير كافٍ",
        },
        { status: 409 }
      );
    }

    if (
      nextStatus ===
      "rejected"
    ) {
      const availableBefore =
        Number(
          balance.available || 0
        );

      balance.locked =
        Number(
          balance.locked || 0
        ) - amount;

      balance.available =
        availableBefore +
        amount;

      await wallet.save();

      await LedgerEntry.create({
        userId:
          withdrawal.userId,
        asset,
        type: "withdrawal",
        amount,
        balanceBefore:
          availableBefore,
        balanceAfter:
          availableBefore +
          amount,
        referenceId:
          String(
            withdrawal._id
          ),
        note:
          adminNote ||
          "تم رفض طلب السحب وإرجاع المبلغ",
      });
    }

    if (
      nextStatus ===
      "completed"
    ) {
      const availableBalance =
        Number(
          balance.available || 0
        );

      balance.locked =
        Number(
          balance.locked || 0
        ) - amount;

      await wallet.save();

      await LedgerEntry.create({
        userId:
          withdrawal.userId,
        asset,
        type: "withdrawal",
        amount: -amount,
        balanceBefore:
          availableBalance,
        balanceAfter:
          availableBalance,
        referenceId:
          String(
            withdrawal._id
          ),
        note:
          adminNote ||
          "تم تنفيذ السحب",
      });
    }

    withdrawal.status =
      nextStatus as
        | "approved"
        | "rejected"
        | "completed";

    withdrawal.adminNote =
      adminNote;

    await withdrawal.save();

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
    });

    return NextResponse.json({
      success: true,
      withdrawal,
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