import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import WithdrawalAddress from "@/models/WithdrawalAddress";

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

    const addresses = await WithdrawalAddress.find({
      userId: user._id,
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      addresses,
    });
  } catch (error) {
    console.error("WITHDRAWAL ADDRESSES GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل العناوين المحفوظة",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();

    const asset = String(body.asset || "")
      .trim()
      .toUpperCase();

    const network = String(body.network || "").trim();

    const address = String(body.address || "").trim();

    if (!asset || !network || !address) {
      return NextResponse.json(
        {
          success: false,
          message: "بيانات العنوان غير مكتملة",
        },
        { status: 400 }
      );
    }

    const saved = await WithdrawalAddress.findOneAndUpdate(
      {
        userId: user._id,
        asset,
        network,
      },
      {
        $set: {
          address,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return NextResponse.json({
      success: true,
      message: "تم حفظ عنوان السحب",
      address: saved,
    });
  } catch (error) {
    console.error("WITHDRAWAL ADDRESSES POST:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر حفظ عنوان السحب",
      },
      { status: 500 }
    );
  }
}