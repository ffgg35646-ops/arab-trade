import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";

import User from "@/models/User";
import Order from "@/models/Order";
import Trade from "@/models/Trade";
import DepositRequest from "@/models/DepositRequest";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Asset from "@/models/Asset";

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

    const [
      usersCount,
      activeUsersCount,
      blockedUsersCount,
      ordersCount,
      tradesCount,
      assetsCount,
      depositsCount,
      pendingDepositsCount,
      withdrawalsCount,
      pendingWithdrawalsCount,
      latestUsers,
      latestDeposits,
      latestWithdrawals,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      Order.countDocuments({}),
      Trade.countDocuments({}),
      Asset.countDocuments({}),
      DepositRequest.countDocuments({}),
      DepositRequest.countDocuments({
        status: "pending",
      }),
      WithdrawalRequest.countDocuments({}),
      WithdrawalRequest.countDocuments({
        status: "pending",
      }),

      User.find({})
        .select("_id name username email role isActive isVerified createdAt")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),

      DepositRequest.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),

      WithdrawalRequest.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        users: usersCount,
        activeUsers: activeUsersCount,
        blockedUsers: blockedUsersCount,
        orders: ordersCount,
        trades: tradesCount,
        assets: assetsCount,
        deposits: depositsCount,
        pendingDeposits: pendingDepositsCount,
        withdrawals: withdrawalsCount,
        pendingWithdrawals: pendingWithdrawalsCount,
      },
      latestUsers: latestUsers.map((u: any) => ({
        ...u,
        _id: u._id ? String(u._id) : undefined,
      })),
      latestDeposits: latestDeposits.map((x: any) => ({
        ...x,
        _id: x._id ? String(x._id) : undefined,
        userId: x.userId ? String(x.userId) : undefined,
      })),
      latestWithdrawals: latestWithdrawals.map((x: any) => ({
        ...x,
        _id: x._id ? String(x._id) : undefined,
        userId: x.userId ? String(x.userId) : undefined,
      })),
    });
  } catch (error) {
    console.error("ADMIN DASHBOARD ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل لوحة التحكم" },
      { status: 500 }
    );
  }
}