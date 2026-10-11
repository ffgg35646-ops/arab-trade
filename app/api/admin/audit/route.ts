import { NextRequest, NextResponse } from "next/server";
import { connectDB as dbConnect } from "@/lib/mongodb";
import AuditLog from "@/models/AuditLog";
import { requireAdminLeader } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  await dbConnect();
  const admin = await requireAdminLeader(request);
  if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 403 });

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);
  const action = String(url.searchParams.get("action") || "").trim();
  const resource = String(url.searchParams.get("resource") || "").trim();

  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;
  if (resource) filter.resource = resource;

  const logs = await AuditLog.find(filter)
    .select("actorId actorRole action resource resourceId ip userAgent metadata createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ success: true, logs });
}