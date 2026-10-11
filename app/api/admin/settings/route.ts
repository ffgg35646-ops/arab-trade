import { NextRequest, NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/platform-settings";
import PlatformSettings from "@/models/PlatformSettings";
import { requireAdminLeader } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 403 }
      );
    }

    const settings = await getPlatformSettings();

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("ADMIN SETTINGS GET:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل إعدادات المنصة" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const allowedSections = [
      "platform",
      "deposits",
      "withdrawals",
      "trading",
      "referral",
      "rewards",
      "notifications",
      "security",
    ];

    const update: Record<string, unknown> = {};

    for (const section of allowedSections) {
      if (body?.[section] && typeof body[section] === "object") {
        for (const [key, value] of Object.entries(body[section])) {
          update[`${section}.${key}`] = value;
        }
      }
    }

    if (!Object.keys(update).length) {
      return NextResponse.json(
        { success: false, message: "لا توجد إعدادات للتحديث" },
        { status: 400 }
      );
    }

    await PlatformSettings.updateOne(
      { key: "global" },
      { $set: update },
      { upsert: true }
    );

    const settings = await getPlatformSettings();

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("ADMIN SETTINGS PATCH:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحديث إعدادات المنصة" },
      { status: 500 }
    );
  }
}