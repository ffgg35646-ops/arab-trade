import crypto from "crypto";

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

export function maskSecret(
  value: string,
  visible = 4
): string {
  if (!value) return "";

  if (value.length <= visible * 2) {
    return "*".repeat(value.length);
  }

  const hidden = value.length - (visible * 2);

  return (
    value.slice(0, visible) +
    "*".repeat(hidden) +
    value.slice(-visible)
  );
}

export function timingSafeStringEqual(
  left: string,
  right: string
): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}