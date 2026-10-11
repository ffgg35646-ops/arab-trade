import { NextRequest } from "next/server";
import mongoose from "mongoose";

import AuditLog from "@/models/AuditLog";

function getClientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  );
}

export async function recordAuditLog(input: {
  request?: NextRequest;
  actorId?: mongoose.Types.ObjectId | string | null;
  actorRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  const actorId =
    input.actorId
      ? new mongoose.Types.ObjectId(String(input.actorId))
      : null;

  return AuditLog.create({
    actorId,
    actorRole: input.actorRole || "",
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId || "",
    ip: input.request
      ? getClientIp(input.request)
      : "",
    userAgent: input.request
      ? input.request.headers.get("user-agent") || ""
      : "",
    metadata: input.metadata || {},
  });
}
