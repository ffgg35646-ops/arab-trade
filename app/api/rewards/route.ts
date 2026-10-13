import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Reward from "@/models/Reward";
import Wallet from "@/models/Wallet";
import UserPackage from "@/models/UserPackage";
import PackageLedger from "@/models/PackageLedger";
import PlatformSettings from "@/models/PlatformSettings";
import LedgerEntry from "@/models/LedgerEntry";

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

    if (settings?.rewards?.enabled === false) {
      return NextResponse.json({
        success: true,
        rewardsEnabled: false,
        rewards: [],
      });
    }

    const now = new Date();

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

    const rewards = await Reward.find({
      userId: user._id,
      status: "available",
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({
      success: true,
      rewardsEnabled: true,
      rewards,
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

      // Route each reward to the currently active package's withdrawal balance.
      // If there is no active package for this asset, use the general withdrawal wallet.
      const activePackage = await UserPackage.findOne({
        userId: user._id,
        status: "active",
        asset,
      })
        .sort({ activatedAt: -1, createdAt: -1 })
        .session(session);

      let before = 0;
      let balanceAfter = 0;
      let destinationNote = "";

      if (activePackage) {
        before = Number(activePackage.availableEarnings || 0);

        const updatedPackage = await UserPackage.findOneAndUpdate(
          {
            _id: activePackage._id,
            userId: user._id,
            status: "active",
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

        balanceAfter = Number(updatedPackage.availableEarnings || 0);
        destinationNote = "رصيد سحب الباقة المفعّلة: " + activePackage.packageName;

        await PackageLedger.create(
          [
            {
              userId: user._id,
              userPackageId: activePackage._id,
              type: "reward",
              asset,
              amount,
              note: "مكافأة صندوق: " + reward.title,
            },
          ],
          { session }
        );
      } else {
        let wallet = await Wallet.findOne({
          userId: user._id,
          type: "funding",
          mode: "live",
        }).session(session);

        if (!wallet) {
          wallet = new Wallet({
            userId: user._id,
            type: "funding",
            mode: "live",
            balances: [],
          });
        }

        let balance = wallet.balances.find(
          (item: any) => String(item.asset || "").toUpperCase() === asset
        );

        if (!balance) {
          wallet.balances.push({
            asset,
            available: amount,
            locked: 0,
          });

          balance = wallet.balances[wallet.balances.length - 1] as any;
          before = 0;
        } else {
          before = Number(balance.available || 0);
          balance.available = before + amount;
        }

        balanceAfter = Number(balance?.available ?? amount);
        await wallet.save({ session });
        destinationNote = "رصيد السحب العام";
      }

      await LedgerEntry.create(
        [
          {
            userId: user._id,
            asset,
            type: "reward",
            amount,
            balanceBefore: before,
            balanceAfter,
            referenceId: String(reward._id),
            note: String(reward.title || "مكافأة") + " — " + destinationNote,
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