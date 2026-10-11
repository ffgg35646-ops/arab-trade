import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import { adjustWallet } from "@/lib/settlement";

import DepositRequest from "@/models/DepositRequest";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";
import Notification from "@/models/Notification";
import ReferralCommission from "@/models/ReferralCommission";
import DepositBalance from "@/models/DepositBalance";

export async function GET(
  request: NextRequest
) {
  try {
    await connectDB();

    const admin =
      await requireAdminLeader(request);

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
        url.searchParams.get("status") ||
          ""
      ).trim();

    const limit = Math.min(
      Math.max(
        Number(
          url.searchParams.get("limit") ||
            100
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

    const deposits =
      await DepositRequest.find(
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
      deposits,
    });
  } catch (error) {
    console.error(
      "ADMIN DEPOSITS GET:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحميل الإيداعات",
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
      await requireAdminLeader(request);

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

    const status =
      String(
        body.status || ""
      ).trim();

    const adminNote =
      String(
        body.adminNote || ""
      ).trim();

    if (
      !id ||
      !["approved", "rejected"].includes(
        status
      )
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

    const deposit =
      await DepositRequest.findById(
        id
      );

    if (!deposit) {
      return NextResponse.json(
        {
          success: false,
          message:
            "الإيداع غير موجود",
        },
        { status: 404 }
      );
    }

    if (deposit.creditedAt) {
      return NextResponse.json(
        { success: false, message: "تم اعتماد هذا الإيداع وإضافة الرصيد بالفعل. لا يمكن إضافته مرة أخرى." },
        { status: 409 }
      );
    }

    if (
      deposit.status !==
      "pending"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "تمت معالجة الطلب مسبقًا",
        },
        { status: 409 }
      );
    }

    const amount =
      Number(deposit.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "قيمة الإيداع غير صحيحة",
        },
        { status: 400 }
      );
    }

    if (status === "approved") {
      const asset = String(deposit.asset || "").trim().toUpperCase();
      const credited = await DepositBalance.findOneAndUpdate(
        { userId: deposit.userId, asset },
        { $inc: { available: amount }, $setOnInsert: { userId: deposit.userId, asset, locked: 0 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      // Save the idempotency marker immediately after the separate bucket is credited.
      deposit.status = "approved";
      deposit.adminNote = adminNote;
      deposit.creditedAt = deposit.creditedAt || new Date();
      await deposit.save();

      await LedgerEntry.create({
        userId: deposit.userId,
        asset,
        type: "deposit",
        amount,
        balanceBefore: Number(credited.available || 0) - amount,
        balanceAfter: Number(credited.available || 0),
        referenceId: String(deposit._id),
        note: adminNote || "إيداع خارجي معتمد — أضيف إلى رصيد الإيداع المنفصل",
      });

      // ============================================
      // REFERRAL COMMISSION — ONLY AFTER APPROVAL
      // ============================================
      const referredUser = await import("@/models/User").then(
        ({ default: UserModel }) =>
          UserModel.findById(deposit.userId)
            .select("referredBy")
            .lean()
      );

      if (referredUser?.referredBy) {
        const settings = await import("@/models/PlatformSettings").then(
          ({ default: PlatformSettings }) =>
            PlatformSettings.findOne({ key: "global" }).lean()
        );

        const referralEnabled =
          settings?.referral?.enabled !== false;

        const commissionPercent = Number(
          settings?.referral?.commissionPercent ?? 0
        );

        if (
          referralEnabled &&
          Number.isFinite(commissionPercent) &&
          commissionPercent > 0
        ) {
          const commission = Number(
            (
              amount *
              (commissionPercent / 100)
            ).toFixed(12)
          );

          if (commission > 0) {
            await ReferralCommission.create({
              referrerId: referredUser.referredBy,
              referredUserId: deposit.userId,
              tradeId: null,
              amount: commission,
              asset,
              rate: commissionPercent,
              status: "available",
            });

            await adjustWallet(
              referredUser.referredBy,
              asset,
              commission,
              0,
              "referral",
              String(deposit._id),
              `عمولة إحالة ${commissionPercent}% من إيداع ${deposit.userId}`
            );
          }
        }
      }
    }

    deposit.status =
      status as
        | "approved"
        | "rejected";

    deposit.adminNote = adminNote;
    if (status === "approved" && !deposit.creditedAt) {
      deposit.creditedAt = new Date();
    }

    await deposit.save();

    await Notification.create({
      userId:
        deposit.userId,
      type: "deposit",
      title:
        status === "approved"
          ? "تم اعتماد الإيداع"
          : "تم رفض الإيداع",
      message:
        adminNote ||
        (status === "approved"
          ? "تمت إضافة قيمة الإيداع إلى محفظتك"
          : "تم رفض طلب الإيداع"),
      read: false,
    });

    if (
      deposit.screenshotPath
    ) {
      const root =
        path.resolve(/*turbopackIgnore: true*/
          process.cwd(),
          "private",
          "deposits"
        );

      const absolute =
        path.resolve(/*turbopackIgnore: true*/
          process.cwd(),
          deposit.screenshotPath
        );

      if (
        absolute.startsWith(
          root + path.sep
        )
      ) {
        await fs.rm(
          path.dirname(
            absolute
          ),
          {
            recursive: true,
            force: true,
          }
        ).catch(() => {});
      }

      deposit.screenshotPath =
        "";

      await deposit.save();
    }

    return NextResponse.json({
      success: true,
      deposit,
    });
  } catch (error) {
    console.error(
      "ADMIN DEPOSITS PATCH:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحديث الإيداع",
      },
      { status: 500 }
    );
  }
}