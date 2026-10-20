import { EncryptJWT, jwtDecrypt } from "jose";

async function getSecret() {
  const secretText = process.env.AUTH_SECRET;
  if (!secretText) throw new Error("AUTH_SECRET is not configured");
  const bytes = new TextEncoder().encode(secretText);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export type PendingRegistration = {
  arabTradeId: number;
  name: string;
  username: string;
  email: string;
  passwordHash: string;
  otpHash: string;
  referralCode?: string;
  registrationId: string;
  expiresAt: number;
};

export async function encryptPending(data: PendingRegistration) {
  return new EncryptJWT(data as Record<string, unknown>)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .encrypt(await getSecret());
}

export async function decryptPending(token: string) {
  const { payload } = await jwtDecrypt(token, await getSecret());
  return payload as unknown as PendingRegistration;
}
