
import crypto from "crypto";

export function createHmacSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body = ""
) {
  return crypto
    .createHmac("sha256", secret)
    .update(
      `${timestamp}${method.toUpperCase()}${path}${body}`
    )
    .digest("hex");
}

export function timingSafeEqualHex(
  left: string,
  right: string
) {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");

    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}