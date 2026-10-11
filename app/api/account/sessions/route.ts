import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB as dbConnect } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import UserSession from "@/models/UserSession";

export async function GET(request: NextRequest) {
  await dbConnect();
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

  const sessions = await UserSession.find({
    userId: user._id,
    revoked: false,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastSeenAt: -1 })
    .lean();

  return NextResponse.json({
    success: true,
    sessions: sessions.map((s) => ({
      id: String(s._id),
      ip: s.ip,
      userAgent: s.userAgent,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  await dbConnect();
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sessionId = String(body.sessionId || "");

  const filter: Record<string, unknown> = {
    userId: user._id,
    revoked: false,
  };

  if (sessionId) filter._id = sessionId;

  await UserSession.updateMany(filter, { $set: { revoked: true } });

  return NextResponse.json({ success: true, message: "تم إنهاء الجلسة" });
}