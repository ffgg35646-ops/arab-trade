import { NextRequest, NextResponse } from "next/server";
import { connectDB as dbConnect } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import NotificationPreference from "@/models/NotificationPreference";

const allowed = [
  "system",
  "security",
  "deposits",
  "withdrawals",
  "orders",
  "trades",
  "rewards",
  "referral",
  "email",
  "push",
];

export async function GET(request: NextRequest) {
  await dbConnect();
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

  const defaults = {
    system: true,
    security: true,
    deposits: true,
    withdrawals: true,
    orders: true,
    trades: true,
    rewards: true,
    referral: true,
    email: true,
    push: true,
  };

  const preferences = await NotificationPreference.findOneAndUpdate(
    { userId: user._id },
    { $setOnInsert: { userId: user._id, ...defaults } },
    { new: true, upsert: true }
  ).lean();

  return NextResponse.json({ success: true, preferences });
}

export async function PATCH(request: NextRequest) {
  await dbConnect();
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, boolean> = {};

  for (const key of allowed) {
    if (typeof body[key] === "boolean") update[key] = body[key];
  }

  const preferences = await NotificationPreference.findOneAndUpdate(
    { userId: user._id },
    { $set: update, $setOnInsert: { userId: user._id } },
    { new: true, upsert: true }
  ).lean();

  return NextResponse.json({ success: true, preferences });
}