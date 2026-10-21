import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";

type DepositTotalRow = {
  _id: { userId: mongoose.Types.ObjectId; asset: string };
  totalAmount: number;
};

async function approvedDepositTotals(userIds: mongoose.Types.ObjectId[]) {
  if (userIds.length === 0) return [] as DepositTotalRow[];

  return DepositRequest.aggregate<DepositTotalRow>([
    {
      $match: {
        userId: { $in: userIds },
        status: "approved",
      },
    },
    {
      $group: {
        _id: {
          userId: "$userId",
          asset: { $toUpper: "$asset" },
        },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);
}

function totalsByUser(rows: DepositTotalRow[]) {
  const result = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const userId = String(row._id.userId);
    const asset = String(row._id.asset || "USDT").trim().toUpperCase();
    const byAsset = result.get(userId) || new Map<string, number>();
    byAsset.set(asset, Number(row.totalAmount || 0));
    result.set(userId, byAsset);
  }

  return result;
}

function toAssetRows(values?: Map<string, number>) {
  if (!values) return [];
  return Array.from(values, ([asset, amount]) => ({ asset, amount }))
    .sort((a, b) => a.asset.localeCompare(b.asset));
}

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
    const parentId = String(searchParams.get("userId") || "").trim();

    if (!mongoose.isValidObjectId(parentId)) {
      return NextResponse.json(
        { success: false, message: "معرف المستخدم غير صحيح" },
        { status: 400 }
      );
    }

    const parent = await User.findById(parentId).select("_id role").lean();
    if (!parent) {
      return NextResponse.json(
        { success: false, message: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    const childUsers = await User.find({
      referredBy: parent._id,
      role: { $nin: ["admin", "admin_leader"] },
    })
      .select("_id name username referredBy role createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const directIds = childUsers.map((user: any) => user._id);
    const directTotals = totalsByUser(await approvedDepositTotals(directIds));

    // Only referrals with an approved external deposit are classed as active.
    const activeChildren = childUsers.filter((user: any) =>
      directTotals.has(String(user._id))
    );

    const activeChildIds = activeChildren.map((user: any) => user._id);
    const grandchildren = activeChildIds.length
      ? await User.find({
          referredBy: { $in: activeChildIds },
          role: { $nin: ["admin", "admin_leader"] },
        })
          .select("_id referredBy")
          .lean()
      : [];

    const grandchildIds = grandchildren.map((user: any) => user._id);
    const grandchildTotals = totalsByUser(
      await approvedDepositTotals(grandchildIds)
    );

    const activeReferralCountByParent = new Map<string, number>();
    const activeReferralDepositsByParent = new Map<string, Map<string, number>>();

    for (const grandchild of grandchildren as any[]) {
      const grandchildId = String(grandchild._id);
      const parentOfGrandchild = String(grandchild.referredBy || "");
      const totals = grandchildTotals.get(grandchildId);

      if (!parentOfGrandchild || !totals) continue;

      activeReferralCountByParent.set(
        parentOfGrandchild,
        (activeReferralCountByParent.get(parentOfGrandchild) || 0) + 1
      );

      const parentTotals =
        activeReferralDepositsByParent.get(parentOfGrandchild) ||
        new Map<string, number>();

      for (const [asset, amount] of totals.entries()) {
        parentTotals.set(asset, (parentTotals.get(asset) || 0) + amount);
      }

      activeReferralDepositsByParent.set(parentOfGrandchild, parentTotals);
    }

    return NextResponse.json({
      success: true,
      referrals: activeChildren.map((user: any) => {
        const id = String(user._id);
        return {
          _id: id,
          name: user.name || "",
          username: user.username || "",
          activeReferralCount: activeReferralCountByParent.get(id) || 0,
          depositsByAsset: toAssetRows(directTotals.get(id)),
          activeReferralDepositsByAsset: toAssetRows(
            activeReferralDepositsByParent.get(id)
          ),
        };
      }),
    });
  } catch (error) {
    console.error("ADMIN USER REFERRALS GET ERROR:", error);
    return NextResponse.json(
      { success: false, message: "تعذر تحميل إحالات المستخدم" },
      { status: 500 }
    );
  }
}
