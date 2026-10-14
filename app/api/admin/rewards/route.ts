import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import Reward from "@/models/Reward";
import User from "@/models/User";
import Notification from "@/models/Notification";
import PlatformSettings from "@/models/PlatformSettings";

function randomAmount(min: number, max: number) {
  const minCents = Math.round(min * 100);
  const maxCents = Math.round(max * 100);

  if (maxCents <= minCents) {
    return minCents / 100;
  }

  return (
    crypto.randomInt(
      minCents,
      maxCents + 1
    ) / 100
  );
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 403 }
      );
    }

    await connectDB();

    const settings = await PlatformSettings.findOne({
      key: "global",
    }).lean();

    const rewards = await Reward.find({})
      .populate(
        "userId",
        "name username email arabTradeId"
      )
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({
      success: true,
      rewardsEnabled:
        settings?.rewards?.enabled !== false,
      rewards,
    });
  } catch (error) {
    console.error("ADMIN REWARDS GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل المكافآت",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const enabled = body.enabled === true;

    await connectDB();

    const settings =
      await PlatformSettings.findOneAndUpdate(
        { key: "global" },
        {
          $set: {
            "rewards.enabled": enabled,
          },
          $setOnInsert: {
            key: "global",
          },
        },
        {
          new: true,
          upsert: true,
        }
      ).lean();

    return NextResponse.json({
      success: true,
      rewardsEnabled:
        settings?.rewards?.enabled !== false,
    });
  } catch (error) {
    console.error("ADMIN REWARDS PATCH:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر حفظ حالة المكافآت",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 403 }
      );
    }

    await connectDB();

    const settings = await PlatformSettings.findOne({
      key: "global",
    }).lean();

    if (settings?.rewards?.enabled === false) {
      return NextResponse.json(
        {
          success: false,
          message: "نظام المكافآت متوقف",
        },
        { status: 409 }
      );
    }

    const body = await request.json();

    const target =
      body.target === "all"
        ? "all"
        : "user";

    const userId = String(
      body.userId || ""
    ).trim();

    const title =
      String(
        body.title || "مكافأة"
      ).trim();

    // Box rewards feed the active package withdrawal balance, which is USDT-only.
    const asset = "USDT";

    const amountMode =
      body.amountMode === "random"
        ? "random"
        : "fixed";

    const durationHours = Number(
      body.durationHours
    );

    if (
      !Number.isFinite(durationHours) ||
      durationHours <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "مدة المكافأة غير صحيحة",
        },
        { status: 400 }
      );
    }

    const now = new Date();

    const expiresAt = new Date(
      now.getTime() +
        durationHours * 60 * 60 * 1000
    );

    let users: any[] = [];

    if (target === "user") {
      if (!userId) {
        return NextResponse.json(
          {
            success: false,
            message: "اختر المستخدم أولًا",
          },
          { status: 400 }
        );
      }

      const user = await User.findById(
        userId
      )
        .select(
          "_id name username email arabTradeId"
        )
        .lean();

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: "المستخدم غير موجود",
          },
          { status: 404 }
        );
      }

      users = [user];
    } else {
      users = await User.find({
        role: "user",
        isActive: true,
      })
        .select(
          "_id name username email arabTradeId"
        )
        .lean();

      if (!users.length) {
        return NextResponse.json(
          {
            success: false,
            message: "لا يوجد مستخدمون",
          },
          { status: 404 }
        );
      }
    }

    let fixedAmount = Number(
      body.fixedAmount
    );

    let minAmount = Number(
      body.minAmount
    );

    let maxAmount = Number(
      body.maxAmount
    );

    if (amountMode === "fixed") {
      if (
        !Number.isFinite(fixedAmount) ||
        fixedAmount <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "قيمة المكافأة غير صحيحة",
          },
          { status: 400 }
        );
      }

      minAmount = fixedAmount;
      maxAmount = fixedAmount;
    } else {
      if (
        !Number.isFinite(minAmount) ||
        !Number.isFinite(maxAmount) ||
        minAmount <= 0 ||
        maxAmount < minAmount
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "نطاق المبلغ غير صحيح",
          },
          { status: 400 }
        );
      }
    }

    const campaignId =
      crypto.randomUUID();

    const rewardDocs = users.map(
      (user) => {
        const amount =
          amountMode === "random"
            ? randomAmount(
                minAmount,
                maxAmount
              )
            : fixedAmount;

        return {
          userId: user._id,
          title,
          type: "bonus",
          amount,
          asset,
          status: "available",
          expiresAt,
          metadata: {
            campaignId,
            amountMode,
            minAmount,
            maxAmount,
            durationHours,
            target,
          },
        };
      }
    );

    const rewards =
      await Reward.insertMany(
        rewardDocs
      );

    const notifications =
      rewards.map((reward: any) => ({
        userId: reward.userId,
        type: "reward",
        title,
        message:
          amountMode === "random"
            ? `لديك صندوق مكافأة بقيمة ${reward.amount} ${asset}. لديك ${durationHours} ساعة لاستلامه.`
            : `لديك صندوق مكافأة بقيمة ${reward.amount} ${asset}. لديك ${durationHours} ساعة لاستلامه.`,
        read: false,
        createdAt: now,
        updatedAt: now,
      }));

    await Notification.insertMany(
      notifications
    );

    const safeRewards =
      rewards.map((reward: any) => ({
        ...reward.toObject(),
        _id: String(reward._id),
        userId: String(reward.userId),
      }));

    return NextResponse.json({
      success: true,
      count: rewards.length,
      message:
        target === "all"
          ? `تم إنشاء ${rewards.length} صندوق مكافأة لجميع المستخدمين`
          : "تم إنشاء صندوق المكافأة للمستخدم",
      campaignId,
      rewards: safeRewards,
    });
  } catch (error) {
    console.error("ADMIN REWARDS POST:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر إنشاء صندوق المكافأة",
      },
      { status: 500 }
    );
  }
}