import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import UserPreference from "@/models/UserPreference";

export async function GET(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const preferences = await UserPreference.findOneAndUpdate(
    { userId: user._id },
    { $setOnInsert: { userId: user._id } },
    { new: true, upsert: true }
  ).lean();

  return NextResponse.json({ success: true, preferences });
}

export async function PATCH(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const update: Record<string, unknown> = {};

  if (typeof body.language === "string") update.language = body.language;
  if (typeof body.displayCurrency === "string") {
    update.displayCurrency = body.displayCurrency.toUpperCase();
  }
  if (["dark", "light", "system"].includes(body.theme)) {
    update.theme = body.theme;
  }
  if (typeof body.hideBalances === "boolean") {
    update.hideBalances = body.hideBalances;
  }
  if (typeof body.emailNotifications === "boolean") {
    update.emailNotifications = body.emailNotifications;
  }
  if (typeof body.pushNotifications === "boolean") {
    update.pushNotifications = body.pushNotifications;
  }
  if (["limit", "market"].includes(body.defaultOrderType)) {
    update.defaultOrderType = body.defaultOrderType;
  }
  if (typeof body.defaultTradingPair === "string") {
    update.defaultTradingPair = body.defaultTradingPair.toUpperCase();
  }

  const preferences = await UserPreference.findOneAndUpdate(
    { userId: user._id },
    {
      $set: update,
      $setOnInsert: { userId: user._id },
    },
    { new: true, upsert: true }
  ).lean();

  return NextResponse.json({ success: true, preferences });
}