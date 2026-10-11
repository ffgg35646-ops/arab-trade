import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getCurrentUser } from "@/lib/current-user";
import PlatformSettings from "@/models/PlatformSettings";

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

    const [invited, active, settings] = await Promise.all([
      User.countDocuments({
        referredBy: user._id,
      }),

      User.countDocuments({
        referredBy: user._id,
        isActive: true,
      }),

      PlatformSettings.findOne({
        key: "global",
      }).lean(),
    ]);

    return NextResponse.json({
      success: true,

      referral: {
        code: user.referralCode,
        invited,
        active,
        earnings: null,

        // نفس قيمة الأدمن
        enabled:
          settings?.referral?.enabled !== false,

        commissionPercent:
          Number(
            settings?.referral?.commissionPercent ?? 0
          ),
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