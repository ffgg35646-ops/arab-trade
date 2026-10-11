import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";
import { getPlatformSettings } from "@/lib/platform-settings";

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

    const settings = await getPlatformSettings();

    return NextResponse.json({
      success: true,
      support: {
        email: settings.support?.email || "",
        facebook: settings.support?.facebook || "",
        telegram: settings.support?.telegram || "",
      },
    });
  } catch (error) {
    console.error("ADMIN SUPPORT GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل بيانات الدعم",
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

    const email = String(body.email || "").trim();
    const facebook = String(body.facebook || "").trim();
    const telegram = String(body.telegram || "").trim();

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          message: "البريد الإلكتروني مطلوب",
        },
        { status: 400 }
      );
    }

    const settings = await getPlatformSettings();

    settings.support = {
      email,
      facebook,
      telegram,
    };

    await settings.save();

    return NextResponse.json({
      success: true,
      message: "تم حفظ بيانات الدعم",
      support: settings.support,
    });
  } catch (error) {
    console.error("ADMIN SUPPORT PATCH:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر حفظ بيانات الدعم",
      },
      { status: 500 }
    );
  }
}