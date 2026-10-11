import { EncryptJWT, jwtDecrypt } from "jose";

function getSecret() {
  const secretText = process.env.AUTH_SECRET;
  if (!secretText) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(secretText);
}

export type PendingRegistration = {
  arabTradeId: number;
  name: string;
  username: string;
  email: string;
  passwordHash: string;
  otpHash: string;
  referralCode?: string;
  expiresAt: number;
};

export async function encryptPending(data: PendingRegistration) {
  return new EncryptJWT(data as Record<string, unknown>)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .encrypt(getSecret());
}

export async function decryptPending(token: string) {
  const { payload } = await jwtDecrypt(token, getSecret());

  return payload as unknown as PendingRegistration;
}