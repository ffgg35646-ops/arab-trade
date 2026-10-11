import { NextRequest, NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/platform-settings";
import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import DepositRequest from "@/models/DepositRequest";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) {
      return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });
    }

    await connectDB();
    const settings = await getPlatformSettings();

    const [invitedCount, activeCountRows, depositTotals] = await Promise.all([
      User.countDocuments({ referredBy: { $exists: true, $ne: null } }),
      DepositRequest.aggregate([
        { $match: { status: "approved" } },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "depositor" } },
        { $unwind: "$depositor" },
        { $match: { "depositor.referredBy": { $type: "objectId" } } },
        { $group: { _id: "$depositor._id" } },
        { $count: "count" }
      ]),
      DepositRequest.aggregate([
        { $match: { status: "approved" } },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "depositor" } },
        { $unwind: "$depositor" },
        { $match: { "depositor.referredBy": { $type: "objectId" } } },
        { $group: { _id: "$asset", amount: { $sum: "$amount" }, deposits: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    return NextResponse.json({
      success: true,
      referral: {
        enabled: settings.referral?.enabled !== false,
        commissionPercent: Number(settings.referral?.commissionPercent ?? 0),
        minPayout: Number(settings.referral?.minPayout ?? 0)
      },
      stats: {
        invitedCount,
        activeReferralCount: Number(activeCountRows[0]?.count || 0),
        depositsByAsset: depositTotals.map((row: any) => ({
          asset: String(row._id || "USDT").toUpperCase(),
          amount: Number(row.amount || 0),
          deposits: Number(row.deposits || 0)
        }))
      }
    });
  } catch (error) {
    console.error("ADMIN REFERRAL GET:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل إعدادات الإحالة" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) {
      return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const commissionPercent = Number(body.commissionPercent);
    const enabled = body.enabled === true;

    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      return NextResponse.json({ success: false, message: "نسبة العمولة يجب أن تكون بين 0 و100" }, { status: 400 });
    }

    const settings = await getPlatformSettings();
    settings.referral.enabled = enabled;
    settings.referral.commissionPercent = commissionPercent;
    await settings.save();

    return NextResponse.json({
      success: true,
      message: "تم حفظ إعدادات الإحالة",
      referral: {
        enabled: settings.referral.enabled,
        commissionPercent: settings.referral.commissionPercent,
        minPayout: settings.referral.minPayout
      }
    });
  } catch (error) {
    console.error("ADMIN REFERRAL PATCH:", error);
    return NextResponse.json({ success: false, message: "تعذر حفظ إعدادات الإحالة" }, { status: 500 });
  }
}
