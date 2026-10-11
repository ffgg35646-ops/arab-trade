
import crypto from "crypto";
import { Types } from "mongoose";
import IdempotencyKey from "@/models/IdempotencyKey";

export function hashRequest(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value ?? {}))
    .digest("hex");
}

export async function getIdempotentResponse(
  userId: Types.ObjectId | string,
  route: string,
  key: string
) {
  if (!key) return null;

  return IdempotencyKey.findOne({
    userId,
    route,
    key
  }).lean();
}

export async function saveIdempotentResponse(
  userId: Types.ObjectId | string,
  route: string,
  key: string,
  requestHash: string,
  responseStatus: number,
  responseBody: unknown
) {
  if (!key) return;

  try {
    await IdempotencyKey.create({
      userId,
      route,
      key,
      requestHash,
      responseStatus,
      responseBody
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }
}