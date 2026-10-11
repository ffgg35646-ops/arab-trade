import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getCurrentUser } from "@/lib/current-user";
import PlatformSettings from "@/models/PlatformSettings";
import ReferralCommission from "@/models/ReferralCommission";

interface CommissionGroup {
  _id: {
    asset?: string;
    status?: string;
  };
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
      return NextResponse.json(
        {
          success: false,
          message: "غير مسجل الدخول",
        },
        { status: 401 }
      );
    }

    await connectDB();

    const referredBy = user._id;

    const [invited, active, referredUsers, settings, commissionGroups] =
      await Promise.all([
        User.countDocuments({
          referredBy,
        }),
        User.countDocuments({
          referredBy,
          isActive: true,
        }),
        User.find({
          referredBy,
        })
          .select("_id name username email createdAt isActive")
          .sort({ createdAt: -1 })
          .limit(200)
          .lean(),
        PlatformSettings.findOne({
          key: "global",
        }).lean(),
        ReferralCommission.aggregate([
          {
            $match: {
              referrerId: referredBy,
            },
          },
          {
            $group: {
              _id: {
                asset: "$asset",
                status: "$status",
              },
              amount: {
                $sum: "$amount",
              },
              count: {
                $sum: 1,
              },
            },
          },
        ]),
      ]);

    const grouped = new Map<string, CommissionSummary>();

    for (const row of commissionGroups as CommissionGroup[]) {
      const asset = String(row._id?.asset || "USDT").toUpperCase();
      const status = String(row._id?.status || "available");
      const summary = grouped.get(asset) || {
        asset,
        total: 0,
        pending: 0,
        available: 0,
        paid: 0,
        count: 0,
      };

      const amount = Number(row.amount || 0);
      summary.total += amount;
      summary.count += Number(row.count || 0);

      if (status === "pending") summary.pending += amount;
      if (status === "available") summary.available += amount;
      if (status === "paid") summary.paid += amount;

      grouped.set(asset, summary);
    }

    const commissionsByAsset = Array.from(grouped.values()).sort((a, b) =>
      a.asset.localeCompare(b.asset)
    );

    return NextResponse.json({
      success: true,
      referral: {
        code: user.referralCode,
        link: "/register?ref=" + encodeURIComponent(user.referralCode || ""),
        invited,
        active,
        enabled: settings?.referral?.enabled !== false,
        commissionPercent: Number(
          settings?.referral?.commissionPercent ?? 10
        ),
        referrals: referredUsers.map((referral) => ({
          _id: String(referral._id),
          name: referral.name,
          username: referral.username,
          email: referral.email,
          createdAt: referral.createdAt,
          active: referral.isActive !== false,
        })),
        commissionsByAsset,
      },
    });
  } catch (error) {
    console.error("REFERRAL ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل الإحالة",
      },
      { status: 500 }
    );
  }
}
