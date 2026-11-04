import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import User from "@/models/User";
import DepositBalance from "@/models/DepositBalance";
import DepositRequest from "@/models/DepositRequest";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Wallet from "@/models/Wallet";
import { creditSpotUsdtBalance, debitSpotUsdtBalance } from "@/lib/unified-usdt-wallet";
import { writeLedger } from "@/lib/ledger";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);

    const q = (searchParams.get("q") || "").trim();
    const status = searchParams.get("status") || "all";
    const sort = searchParams.get("sort") === "oldest" ? 1 : -1;

    const filter: Record<string, unknown> = {
      $or: [
        { role: "user" },
        { role: { $exists: false } },
      ],
    };

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const numericQ = Number(q);

      filter.$or = [
        { name: rx },
        { username: rx },
        { email: rx },
        ...(Number.isFinite(numericQ)
          ? [{ arabTradeId: numericQ }]
          : []),
      ];
    }

    if (status === "active") {
      filter.isActive = true;
    }

    if (status === "blocked") {
      filter.isActive = false;
    }

    const users = await User.find(filter)
      .select(
        "_id arabTradeId name username email role isActive isVerified referralCode createdAt updatedAt"
      )
      .sort({ createdAt: sort })
      .limit(500)
      .lean();

    const userIds = users.map((user: any) => user._id);
    const [depositRows, walletRows] = await Promise.all([
      DepositBalance.find({ userId: { $in: userIds } }).lean(),
      Wallet.find({ userId: { $in: userIds }, type: "spot", mode: "live" })
        .select("userId balances")
        .lean(),
    ]);

    const depositByUser = new Map<string, any[]>();
    for (const row of depositRows as any[]) {
      const key = String(row.userId);
      depositByUser.set(key, [...(depositByUser.get(key) || []), {
        asset: String(row.asset || "").toUpperCase(), available: Number(row.available || 0), locked: Number(row.locked || 0),
      }]);
    }

    const walletByUser = new Map<string, { available: number; locked: number }>();
    for (const wallet of walletRows as any[]) {
      const totals = (wallet.balances || []).reduce(
        (sum: { available: number; locked: number }, balance: any) => {
          if (String(balance.asset || "").trim().toUpperCase() !== "USDT") return sum;
          sum.available += Math.max(0, Number(balance.available || 0));
          sum.locked += Math.max(0, Number(balance.locked || 0));
          return sum;
        },
        { available: 0, locked: 0 },
      );
      walletByUser.set(String(wallet.userId), totals);
    }

    // Count only successful withdrawals. "amount" is the gross amount released
    // from the user's withdrawal balance, with legacy rows falling back to amount.
    const [withdrawalRows, referredUsers] = await Promise.all([
      userIds.length
        ? WithdrawalRequest.aggregate([
            { $match: { userId: { $in: userIds }, status: "approved" } },
            {
              $group: {
                _id: "$userId",
                count: { $sum: 1 },
                totalAmount: { $sum: { $ifNull: ["$grossAmount", "$amount"] } },
              },
            },
          ])
        : Promise.resolve([]),
      userIds.length
        ? User.find({
            referredBy: { $in: userIds },
            role: { $nin: ["admin", "admin_leader"] },
          })
            .select("_id referredBy")
            .lean()
        : Promise.resolve([]),
    ]);

    const withdrawalByUser = new Map<string, { count: number; totalAmount: number }>();
    for (const row of withdrawalRows as any[]) {
      withdrawalByUser.set(String(row._id), {
        count: Number(row.count || 0),
        totalAmount: Number(row.totalAmount || 0),
      });
    }

    // A referral is active when at least one external deposit has been approved,
    // matching the referral dashboard's existing definition.
    const referredUserIds = (referredUsers as any[]).map((user) => user._id);
    const approvedDepositRows = referredUserIds.length
      ? await DepositRequest.aggregate([
          { $match: { userId: { $in: referredUserIds }, status: "approved" } },
          {
            $group: {
              _id: {
                userId: "$userId",
                asset: { $toUpper: "$asset" },
              },
              totalAmount: { $sum: "$amount" },
            },
          },
        ])
      : [];

    const approvedDepositsByUser = new Map<string, Map<string, number>>();
    for (const row of approvedDepositRows as any[]) {
      const userId = String(row._id.userId);
      const asset = String(row._id.asset || "USDT").toUpperCase();
      const byAsset = approvedDepositsByUser.get(userId) || new Map<string, number>();
      byAsset.set(asset, Number(row.totalAmount || 0));
      approvedDepositsByUser.set(userId, byAsset);
    }

    const activeReferralCountByUser = new Map<string, number>();
    const activeReferralDepositsByUser = new Map<string, Map<string, number>>();
    for (const referred of referredUsers as any[]) {
      const referredId = String(referred._id);
      const parentId = String(referred.referredBy);
      const deposits = approvedDepositsByUser.get(referredId);

      if (!deposits || deposits.size === 0) continue;

      activeReferralCountByUser.set(
        parentId,
        (activeReferralCountByUser.get(parentId) || 0) + 1
      );

      const parentTotals =
        activeReferralDepositsByUser.get(parentId) || new Map<string, number>();
      for (const [asset, amount] of deposits.entries()) {
        parentTotals.set(asset, (parentTotals.get(asset) || 0) + amount);
      }
      activeReferralDepositsByUser.set(parentId, parentTotals);
    }

    return NextResponse.json({
      success: true,
      users: users.map((user: any) => {
        const id = String(user._id);
        const referralTotals = activeReferralDepositsByUser.get(id);
        return {
          ...user,
          _id: id,
          depositBalances: depositByUser.get(id) || [],
          walletBalance: walletByUser.get(id)?.available || 0,
          walletLockedBalance: walletByUser.get(id)?.locked || 0,
          withdrawalCount: withdrawalByUser.get(id)?.count || 0,
          withdrawnAmount: withdrawalByUser.get(id)?.totalAmount || 0,
          activeReferralCount: activeReferralCountByUser.get(id) || 0,
          activeReferralDepositsByAsset: referralTotals
            ? Array.from(referralTotals, ([asset, amount]) => ({ asset, amount }))
                .sort((a, b) => a.asset.localeCompare(b.asset))
            : [],
        };
      }),
    });
  } catch (error) {
    console.error("ADMIN USERS GET ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل المستخدمين" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const id = String(body.id || "");
    const action = String(body.action || "");

    if (action === "adjustBalance") {
      const operation = String(body.operation || "");
      const amount = Number(body.amount);
      if (
        !mongoose.isValidObjectId(id) ||
        !["add", "subtract"].includes(operation) ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 1000000000 ||
        Math.round(amount * 1e8) / 1e8 !== amount
      ) {
        return NextResponse.json(
          { success: false, message: "المستخدم أو مبلغ التعديل غير صالح" },
          { status: 400 }
        );
      }

      await connectDB();
      const target = await User.findOne({
        _id: id,
        $or: [{ role: "user" }, { role: { $exists: false } }],
      }).select("_id").lean();
      if (!target) {
        return NextResponse.json(
          { success: false, message: "المستخدم غير موجود" },
          { status: 404 }
        );
      }

      const session = await mongoose.startSession();
      let balanceAfter = 0;
      try {
        await session.withTransaction(async () => {
          const adjustment = operation === "add"
            ? await creditSpotUsdtBalance(target._id, amount, session)
            : await debitSpotUsdtBalance(target._id, amount, session);

          if (operation === "subtract" && "ok" in adjustment && !adjustment.ok) {
            throw new Error("INSUFFICIENT_USER_BALANCE");
          }

          balanceAfter = adjustment.availableAfter;
          const signedAmount = operation === "add" ? amount : -amount;
          await writeLedger(
            target._id,
            "USDT",
            operation === "add" ? "reward" : "adjustment",
            signedAmount,
            adjustment.availableBefore,
            adjustment.availableAfter,
            "admin-balance-adjustment:" + String(admin._id) + ":" + new mongoose.Types.ObjectId().toString(),
            operation === "add" ? "مكافأة يدوية من الإدارة" : "خصم يدوي من الإدارة",
            session
          );
        });
      } catch (adjustmentError) {
        if (adjustmentError instanceof Error && adjustmentError.message === "INSUFFICIENT_USER_BALANCE") {
          return NextResponse.json(
            { success: false, message: "الرصيد المتاح لا يكفي لإتمام الخصم" },
            { status: 400 }
          );
        }
        throw adjustmentError;
      } finally {
        await session.endSession();
      }

      return NextResponse.json({
        success: true,
        message: operation === "add"
          ? "تمت إضافة المكافأة إلى رصيد المستخدم"
          : "تم خصم المبلغ من رصيد المستخدم",
        walletBalance: balanceAfter,
      });
    }

    if (!id || !["block", "unblock"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "طلب غير صالح" },
        { status: 400 }
      );
    }

    if (id === String(admin._id)) {
      return NextResponse.json(
        { success: false, message: "لا يمكن حظر حسابك الإداري" },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findByIdAndUpdate(
      id,
      { $set: { isActive: action === "unblock" } },
      { new: true }
    ).select("_id name username email role isActive isVerified");

    if (!user) {
      return NextResponse.json(
        { success: false, message: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        action === "block"
          ? "تم حظر المستخدم"
          : "تم فك حظر المستخدم",
      user: {
        ...user.toObject(),
        _id: String(user._id),
      },
    });
  } catch (error) {
    console.error("ADMIN USERS PATCH ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تعديل حالة المستخدم" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "معرف المستخدم مطلوب" },
        { status: 400 }
      );
    }

    if (id === String(admin._id)) {
      return NextResponse.json(
        { success: false, message: "لا يمكن حذف حسابك الإداري" },
        { status: 400 }
      );
    }

    await connectDB();

    const deleted = await User.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم حذف المستخدم",
    });
  } catch (error) {
    console.error("ADMIN USERS DELETE ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر حذف المستخدم" },
      { status: 500 }
    );
  }
}