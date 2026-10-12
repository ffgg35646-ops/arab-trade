import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import DepositRequest from "@/models/DepositRequest";
import Wallet from "@/models/Wallet";
import User from "@/models/User";
import PlatformSettings from "@/models/PlatformSettings";
import LedgerEntry from "@/models/LedgerEntry";
import Notification from "@/models/Notification";
import ReferralCommission from "@/models/ReferralCommission";
import DepositBalance from "@/models/DepositBalance";
import BlockchainDepositClaim from "@/models/BlockchainDepositClaim";

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
        .select("-screenshotData")
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

export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    const admin = await requireAdminLeader(request);
    if (!admin) {
      return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim();
    const adminNote = String(body.adminNote || "").trim();

    if (!id || !mongoose.Types.ObjectId.isValid(id) || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ success: false, message: "بيانات غير صحيحة" }, { status: 400 });
    }

    const initial = await DepositRequest.findById(id).lean();
    if (!initial) {
      return NextResponse.json({ success: false, message: "الإيداع غير موجود" }, { status: 404 });
    }

    const amount = Number(initial.amount);
    const asset = String(initial.asset || "").trim().toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !asset) {
      return NextResponse.json({ success: false, message: "قيمة الإيداع أو العملة غير صحيحة" }, { status: 400 });
    }

    if (status === "approved" && String(initial.txHash || "").trim()) {
      await BlockchainDepositClaim.init();
    }

    const session = await mongoose.startSession();
    let processed: any = null;

    try {
      await session.withTransaction(async () => {
        // Compare-and-set status protects against two admins approving the same request.
        const current = await DepositRequest.findOneAndUpdate(
          { _id: id, status: "pending", creditedAt: null },
          {
            $set: {
              status,
              adminNote,
              ...(status === "approved" ? { creditedAt: new Date() } : {}),
            },
          },
          { new: true, session, runValidators: true }
        );

        if (!current) {
          throw new Error("DEPOSIT_ALREADY_PROCESSED");
        }

        if (status === "approved") {
          const txHash = String(current.txHash || "").trim().toLowerCase();
          if (txHash) {
            const duplicateDeposit = await DepositRequest.findOne({
              _id: { $ne: current._id },
              txHash: current.txHash,
              creditedAt: { $ne: null },
            }).session(session).lean();
            if (duplicateDeposit) throw new Error("DEPOSIT_TXHASH_ALREADY_CREDITED");

            try {
              await BlockchainDepositClaim.create([{
                txHash,
                depositRequestId: current._id,
                userId: current.userId,
                asset,
                network: String(current.network || "").toUpperCase(),
                amount,
              }], { session });
            } catch (claimError: any) {
              if (claimError?.code === 11000) throw new Error("DEPOSIT_TXHASH_ALREADY_CREDITED");
              throw claimError;
            }
          }

          const credited = await DepositBalance.findOneAndUpdate(
            { userId: current.userId, asset },
            {
              $inc: { available: amount },
              $setOnInsert: { userId: current.userId, asset, locked: 0 },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true, session }
          );

          await LedgerEntry.create([{
            userId: current.userId,
            asset,
            type: "deposit",
            amount,
            balanceBefore: Number(credited.available || 0) - amount,
            balanceAfter: Number(credited.available || 0),
            referenceId: String(current._id),
            note: adminNote || "إيداع خارجي معتمد — أضيف إلى رصيد الإيداع المنفصل",
          }], { session });

          // Referral activity and commission are tied to this one approved external deposit.
          const referredUser = await User.findById(current.userId).select("referredBy").session(session).lean();
          if (referredUser?.referredBy) {
            const settings = await PlatformSettings.findOne({ key: "global" }).session(session).lean();
            const enabled = settings?.referral?.enabled !== false;
            const commissionPercent = Number(settings?.referral?.commissionPercent ?? 0);

            if (enabled && Number.isFinite(commissionPercent) && commissionPercent > 0 && commissionPercent <= 100) {
              const commission = Number((amount * commissionPercent / 100).toFixed(12));
              if (commission > 0) {
                const referrerId = referredUser.referredBy;
                await ReferralCommission.create([{
                  referrerId,
                  referredUserId: current.userId,
                  tradeId: null,
                  amount: commission,
                  asset,
                  rate: commissionPercent,
                  status: "available",
                }], { session });

                let wallet = await Wallet.findOne({
                  userId: referrerId,
                  type: "spot",
                  mode: "live",
                }).session(session);

                if (!wallet) {
                  wallet = new Wallet({
                    userId: referrerId,
                    type: "spot",
                    mode: "live",
                    balances: [],
                  });
                }

                let walletBalance = wallet.balances.find((item: any) => String(item.asset).toUpperCase() === asset);
                const before = Number(walletBalance?.available || 0);
                if (!walletBalance) {
                  wallet.balances.push({ asset, available: commission, locked: 0 });
                  walletBalance = wallet.balances[wallet.balances.length - 1] as any;
                } else {
                  walletBalance.available = Number((before + commission).toFixed(12));
                }
                const after = Number(walletBalance?.available || 0);
                await wallet.save({ session });

                await LedgerEntry.create([{
                  userId: referrerId,
                  asset,
                  type: "referral",
                  amount: commission,
                  balanceBefore: before,
                  balanceAfter: after,
                  referenceId: String(current._id),
                  note: `عمولة إحالة ${commissionPercent}% من إيداع ${current.userId}`,
                }], { session });
              }
            }
          }
        }

        processed = current;
      });
    } catch (settlementError) {
      const code = settlementError instanceof Error ? settlementError.message : "";
      if (code === "DEPOSIT_ALREADY_PROCESSED" || code === "DEPOSIT_TXHASH_ALREADY_CREDITED") {
        return NextResponse.json({
          success: false,
          message: code === "DEPOSIT_TXHASH_ALREADY_CREDITED"
            ? "رقم المعاملة هذا استُخدم لاعتماد إيداع آخر. لم تتم إضافة أي رصيد."
            : "تمت معالجة طلب الإيداع بالفعل، ولم تتم إضافة الرصيد مرة أخرى.",
        }, { status: 409 });
      }
      console.error("ADMIN DEPOSIT SETTLEMENT:", settlementError);
      return NextResponse.json({
        success: false,
        message: "تعذر اعتماد الإيداع أو تحديث الأرصدة؛ لم يتم اعتماد تغييرات جزئية.",
      }, { status: 500 });
    } finally {
      await session.endSession();
    }

    // Notification is ancillary: a delivery failure must not turn a successful credit into a false API failure.
    await Notification.create({
      userId: initial.userId,
      type: "deposit",
      title: status === "approved" ? "تم اعتماد الإيداع" : "تم رفض الإيداع",
      message: adminNote || (status === "approved"
        ? "تمت إضافة قيمة الإيداع إلى رصيد الإيداع."
        : "تم رفض طلب الإيداع."),
      read: false,
    }).catch((notificationError) => {
      console.error("ADMIN DEPOSIT NOTIFICATION:", notificationError);
    });

    return NextResponse.json({
      success: true,
      message: status === "approved"
        ? "تم اعتماد الإيداع وإضافة الرصيد وتسجيل الإحالة إن وجدت."
        : "تم رفض طلب الإيداع.",
      deposit: processed,
    });
  } catch (error) {
    console.error("ADMIN DEPOSITS PATCH:", error);
    return NextResponse.json({ success: false, message: "تعذر تحديث الإيداع" }, { status: 500 });
  }
}
