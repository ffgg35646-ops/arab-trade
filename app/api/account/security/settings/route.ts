
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import UserPreference from "@/models/UserPreference";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    await connectDB();

    const prefs = await UserPreference.findOne({ userId: user._id }).lean();

    return NextResponse.json({
      security: prefs || {
        antiPhishingCode: "",
        loginAlerts: true,
        withdrawalAlerts: true,
        tradingAlerts: true
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    await connectDB();

    const body = await request.json();

    const antiPhishingCode =
      typeof body.antiPhishingCode === "string"
        ? body.antiPhishingCode.slice(0, 64)
        : undefined;

    const update: Record<string, any> = {};

    if (antiPhishingCode !== undefined) {
      update.antiPhishingCode = antiPhishingCode;
    }

    if (typeof body.loginAlerts === "boolean") {
      update.loginAlerts = body.loginAlerts;
    }

    if (typeof body.withdrawalAlerts === "boolean") {
      update.withdrawalAlerts = body.withdrawalAlerts;
    }

    if (typeof body.tradingAlerts === "boolean") {
      update.tradingAlerts = body.tradingAlerts;
    }

    const prefs = await UserPreference.findOneAndUpdate(
      { userId: user._id },
      { $set: update },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      security: prefs
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 400 }
    );
  }
}