import { requireVerifiedIdentity } from "@/lib/require-kyc";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Wallet from "@/models/Wallet";
import Transfer from "@/models/Transfer";
import Notification from "@/models/Notification";
import { getCurrentUser } from "@/lib/current-user";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";

export async function POST(request: NextRequest) {
  try {
    const kycGuard = await requireVerifiedIdentity(request);

    if (!kycGuard.ok) {
      return NextResponse.json(
        {
          success: false,
          message: kycGuard.message,
        },
        { status: kycGuard.status }
      );
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();
    await migrateLegacyDepositBalancesToSpotWallet(user._id);

    const body = await request.json();

    const asset = String(body.asset || "").trim().toUpperCase();
    const from = String(body.from || "") as "spot" | "funding";
    const to = String(body.to || "") as "spot" | "funding";
    const amount = Number(body.amount);

    if (
      !asset ||
      !["spot", "funding"].includes(from) ||
      !["spot", "funding"].includes(to) ||
      from === to ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "بيانات التحويل غير صحيحة" },
        { status: 400 }
      );
    }

    const source = await Wallet.findOneAndUpdate(
      {
        userId: user._id,
        type: from,
        balances: {
          $elemMatch: {
            asset,
            available: { $gte: amount },
          },
        },
      },
      {
        $inc: {
          "balances.$.available": -amount,
        },
      },
      { new: true }
    );

    if (!source) {
      return NextResponse.json(
        { success: false, message: "الرصيد غير كافٍ في المحفظة المصدر" },
        { status: 400 }
      );
    }

    const destination = await Wallet.findOneAndUpdate(
      {
        userId: user._id,
        type: to,
        "balances.asset": asset,
      },
      {
        $inc: {
          "balances.$.available": amount,
        },
      },
      { new: true }
    );

    if (!destination) {
      await Wallet.updateOne(
        { _id: source._id, "balances.asset": asset },
        { $inc: { "balances.$.available": amount } }
      );

      return NextResponse.json(
        { success: false, message: "تعذر تحديث المحفظة المستهدفة" },
        { status: 500 }
      );
    }

    const transfer = await Transfer.create({
      userId: user._id,
      asset,
      amount,
      from,
      to,
      status: "completed",
    });

    await Notification.create({
      userId: user._id,
      type: "account",
      title: "تم تنفيذ التحويل",
      message: `تم تحويل ${amount} ${asset} من ${from} إلى ${to}.`,
    });

    return NextResponse.json({
      success: true,
      message: "تم تنفيذ التحويل",
      transfer,
    });
  } catch (error) {
    console.error("TRANSFER ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تنفيذ التحويل" },
      { status: 500 }
    );
  }
}