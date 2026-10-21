import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Reward from "@/models/Reward";
import UserPackage from "@/models/UserPackage";
import PackageLedger from "@/models/PackageLedger";
import PlatformSettings from "@/models/PlatformSettings";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 401 }
      );
    }

    const settings = await PlatformSettings.findOne({
      key: "global",
    }).lean();

    const rewardsEnabled = settings?.rewards?.enabled !== false;
    const now = new Date();

    if (rewardsEnabled) {
      await Reward.updateMany(
        {
          userId: user._id,
          status: "available",
          expiresAt: {
            $ne: null,
            $lte: now,
          },
        },
        {
          $set: {
            status: "expired",
          },
        }
      );
    }

    const rewards = rewardsEnabled
      ? await Reward.find({
          userId: user._id,
          status: "available",
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: now } },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(200)
          .lean()
      : [];

    // The Reward collection is the source of truth for successful claims.
    // PackageLedger records the financial credit in the active package bucket,
    // so do not derive reward counts from the unrelated general-wallet LedgerEntry.
    const claimedFilter = {
      userId: user._id,
      status: "claimed" as const,
    };

    const [claimedCount, claimedRewards, totalsByAsset] = await Promise.all([
      Reward.countDocuments(claimedFilter),
      Reward.find(claimedFilter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(100)
        .lean(),
      Reward.aggregate([
        { $match: claimedFilter },
        {
          $group: {
            _id: { $toUpper: "$asset" },
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const claimedByAsset: Record<string, number> = {};
    for (const item of totalsByAsset) {
      const asset = String(item._id || "").trim().toUpperCase();
      if (asset) claimedByAsset[asset] = Number(item.total || 0);
    }

    const totalClaimed = Object.values(claimedByAsset).reduce(
      (sum, amount) => sum + amount,
      0
    );

    return NextResponse.json({
      success: true,
      rewardsEnabled,
      rewards,
      claimedCount,
      claimedRewards,
      claimedByAsset,
      totalClaimed,
    });
  } catch (error) {
    console.error("REWARDS GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل المكافآت",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await mongoose.startSession();

  try {
    await connectDB();

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 401 }
      );
    }

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

    const body = await request.json().catch(() => ({}));

    const rewardId = String(body.rewardId || "").trim();

    if (!mongoose.isValidObjectId(rewardId)) {
      return NextResponse.json(
        {
          success: false,
          message: "معرف المكافأة غير صحيح",
        },
        { status: 400 }
      );
    }

    let result:
      | {
          _id: string;
          status: "claimed";
          amount: number;
          asset: string;
        }
      | null = null;

    await session.withTransaction(async () => {
      const reward = await Reward.findOne({
        _id: rewardId,
        userId: user._id,
        status: "available",
      }).session(session);

      if (!reward) {
        throw new Error("REWARD_NOT_AVAILABLE");
      }

      if (
        reward.expiresAt &&
        reward.expiresAt.getTime() <= Date.now()
      ) {
        reward.status = "expired";
        await reward.save({ session });

        throw new Error("REWARD_EXPIRED");
      }

      const asset = String(reward.asset || "")
        .trim()
        .toUpperCase();

      const amount = Number(reward.amount);

      if (
        !asset ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new Error("INVALID_REWARD");
      }

      if (asset !== "USDT") {
        throw new Error("REWARD_ASSET_NOT_SUPPORTED");
      }

      // A box reward must be credited to the currently active package only.
      // Never fall back to the general wallet or an older/cancelled package.
      const activePackage = await UserPackage.findOne({
        userId: user._id,
        status: "active",
        asset: "USDT",
      })
        .sort({ activatedAt: -1, createdAt: -1 })
        .session(session);

      if (!activePackage) {
        throw new Error("ACTIVE_PACKAGE_REQUIRED");
      }

      const updatedPackage = await UserPackage.findOneAndUpdate(
        {
          _id: activePackage._id,
          userId: user._id,
          status: "active",
          asset: "USDT",
        },
        {
          $inc: {
            availableEarnings: amount,
            totalRealizedEarnings: amount,
          },
        },
        { new: true, session }
      );

      if (!updatedPackage) {
        throw new Error("REWARD_PACKAGE_UPDATE_FAILED");
      }

      await PackageLedger.create(
        [
          {
            userId: user._id,
            userPackageId: activePackage._id,
            type: "reward",
            asset: "USDT",
            amount,
            note: "مكافأة صندوق: " + reward.title + " — أضيفت إلى رصيد سحب الباقة النشطة",
          },
        ],
        { session }
      );

      reward.status = "claimed";

      await reward.save({ session });

      result = {
        _id: String(reward._id),
        status: "claimed",
        amount,
        asset,
      };
    });

    if (!result) {
      throw new Error("REWARD_CLAIM_FAILED");
    }

    return NextResponse.json({
      success: true,
      reward: result,
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "";

    if (code === "REWARD_NOT_AVAILABLE") {
      return NextResponse.json(
        {
          success: false,
          message: "المكافأة غير متاحة أو تم استلامها بالفعل",
        },
        { status: 409 }
      );
    }

    if (code === "REWARD_EXPIRED") {
      return NextResponse.json(
        {
          success: false,
          message: "انتهت صلاحية المكافأة",
        },
        { status: 409 }
      );
    }

    if (code === "ACTIVE_PACKAGE_REQUIRED") {
      return NextResponse.json(
        {
          success: false,
          message: "لاستلام مكافأة الصندوق يجب أن تكون لديك باقة USDT نشطة؛ لم يتم تحويل المكافأة إلى المحفظة العامة.",
        },
        { status: 409 }
      );
    }

    if (code === "REWARD_ASSET_NOT_SUPPORTED") {
      return NextResponse.json(
        {
          success: false,
          message: "مكافآت الصندوق تُضاف إلى رصيد سحب الباقة النشطة بعملة USDT فقط.",
        },
        { status: 400 }
      );
    }

    if (code === "INVALID_REWARD") {
      return NextResponse.json(
        {
          success: false,
          message: "بيانات المكافأة غير صحيحة",
        },
        { status: 400 }
      );
    }

    console.error("REWARDS POST:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر استلام المكافأة",
      },
      { status: 500 }
    );
  } finally {
    await session.endSession();
  }
}