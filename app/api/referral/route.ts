import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";
import { getCurrentUser } from "@/lib/current-user";
import PlatformSettings from "@/models/PlatformSettings";
import ReferralCommission from "@/models/ReferralCommission";

interface DepositGroup {
  _id: { userId: unknown; asset?: string };
  amount?: number;
  count?: number;
}
interface CommissionGroup {
  _id: { asset?: string; status?: string };
  amount?: number;
  count?: number;
}
interface CommissionSummary {
  asset: string;
  total: number;
  pending: number;
  available: number;
  paid: number;
  count: number;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
    }

    await connectDB();
    const referredBy = user._id;

    const [invited, referredUsers, settings, commissionGroups, depositGroups] = await Promise.all([
      User.countDocuments({ referredBy }),
      User.find({ referredBy })
        .select("_id name username email createdAt isActive")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      PlatformSettings.findOne({ key: "global" }).lean(),
      ReferralCommission.aggregate([
        { $match: { referrerId: referredBy } },
        { $group: {
          _id: { asset: "$asset", status: "$status" },
          amount: { $sum: "$amount" },
          count: { $sum: 1 }
        } }
      ]),
      DepositRequest.aggregate([
        { $match: { status: "approved" } },
        { $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "depositor"
        } },
        { $unwind: "$depositor" },
        { $match: { "depositor.referredBy": referredBy } },
        { $group: {
          _id: { userId: "$userId", asset: "$asset" },
          amount: { $sum: "$amount" },
          count: { $sum: 1 }
        } }
      ])
    ]);

    // Restore the intended 10% default if an earlier settings handler stored 0%.
    if (settings?.referral?.enabled !== false && Number(settings?.referral?.commissionPercent ?? 0) <= 0) {
      await PlatformSettings.updateOne(
        { key: "global" },
        { $set: { "referral.commissionPercent": 10 } }
      );
      if (settings?.referral) settings.referral.commissionPercent = 10;
    }

    const depositsByUser = new Map<string, { asset: string; amount: number; count: number }[]>();
    for (const row of depositGroups as DepositGroup[]) {
      const id = String(row._id.userId);
      const item = {
        asset: String(row._id.asset || "USDT").toUpperCase(),
        amount: Number(row.amount || 0),
        count: Number(row.count || 0)
      };
      depositsByUser.set(id, [...(depositsByUser.get(id) || []), item]);
    }

    const commissions = new Map<string, CommissionSummary>();
    for (const row of commissionGroups as CommissionGroup[]) {
      const asset = String(row._id?.asset || "USDT").toUpperCase();
      const status = String(row._id?.status || "available");
      const item = commissions.get(asset) || { asset, total: 0, pending: 0, available: 0, paid: 0, count: 0 };
      const amount = Number(row.amount || 0);
      item.total += amount;
      item.count += Number(row.count || 0);
      if (status === "pending") item.pending += amount;
      if (status === "available") item.available += amount;
      if (status === "paid") item.paid += amount;
      commissions.set(asset, item);
    }

    return NextResponse.json({
      success: true,
      referral: {
        code: user.referralCode,
        link: "/register?ref=" + encodeURIComponent(user.referralCode || ""),
        invited,
        // Active means at least one externally funded deposit was approved.
        active: depositsByUser.size,
        enabled: settings?.referral?.enabled !== false,
        commissionPercent: Number(settings?.referral?.commissionPercent ?? 10),
        referrals: referredUsers.map((referral) => ({
          _id: String(referral._id),
          name: referral.name,
          username: referral.username,
          email: referral.email,
          createdAt: referral.createdAt,
          active: depositsByUser.has(String(referral._id)),
          depositsByAsset: depositsByUser.get(String(referral._id)) || []
        })),
        commissionsByAsset: Array.from(commissions.values()).sort((a, b) => a.asset.localeCompare(b.asset))
      }
    });
  } catch (error) {
    console.error("REFERRAL ERROR:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل الإحالة" }, { status: 500 });
  }
}
