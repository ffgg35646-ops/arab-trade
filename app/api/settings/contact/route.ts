import { NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/platform-settings";

export async function GET() {
  try {
    const settings = await getPlatformSettings();

    return NextResponse.json({
      success: true,
      data: {
        telegram: settings.support?.telegram || "",
        facebook: settings.support?.facebook || "",
        email: settings.support?.email || "",
      },
    });
  } catch (error) {
    console.error("CONTACT SETTINGS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل بيانات الدعم",
      },
      { status: 500 }
    );
  }
}