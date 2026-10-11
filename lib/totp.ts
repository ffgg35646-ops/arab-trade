import crypto from "crypto";

function base32Encode(buf: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 secret");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const cleanToken = token.replace(/\D/g, "");
  if (cleanToken.length !== 6) return false;

  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / 30);

  for (let offset = -window; offset <= window; offset++) {
    const counter = time + offset;
    const buf = Buffer.alloc(8);

    // تحويل عداد TOTP إلى 8 بايت بدون BigInt
    let high = Math.floor(counter / 0x100000000);
    let low = counter >>> 0;

    for (let i = 7; i >= 4; i--) {
      buf[i] = low & 0xff;
      low = Math.floor(low / 256);
    }

    for (let i = 3; i >= 0; i--) {
      buf[i] = high & 0xff;
      high = Math.floor(high / 256);
    }

    const hmac = crypto.createHmac("sha1", key).update(buf).digest();
    const index = hmac[hmac.length - 1] & 0x0f;
    const bin =
      ((hmac[index] & 0x7f) << 24) |
      ((hmac[index + 1] & 0xff) << 16) |
      ((hmac[index + 2] & 0xff) << 8) |
      (hmac[index + 3] & 0xff);

    const code = String(bin % 1000000).padStart(6, "0");
    if (code === cleanToken) return true;
  }

  return false;
}