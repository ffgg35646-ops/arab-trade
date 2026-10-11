import { NextRequest, NextResponse } from "next/server";
import { connectDB as dbConnect } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import TwoFactor from "@/models/TwoFactor";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";
import crypto from "crypto";

function makeBackupCodes() {
  return Array.from({ length: 10 }, () =>
    crypto.randomBytes(5).toString("hex").toUpperCase()
  );
}

export async function GET(request: NextRequest) {
  await dbConnect();
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

  const existing = await TwoFactor.findOne({ userId: user._id }).lean();

  return NextResponse.json({
    success: true,
    enabled: Boolean(existing?.enabled),
  });
}

export async function POST(request: NextRequest) {
  await dbConnect();
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const token = String(body.token || "").replace(/\s/g, "");

  let record = await TwoFactor.findOne({ userId: user._id });

  if (action === "setup") {
    const secret = generateTotpSecret();

    record =
      record ||
      new TwoFactor({
        userId: user._id,
        secret,
        enabled: false,
      });

    record.secret = secret;
    record.enabled = false;
    record.backupCodes = makeBackupCodes();
    await record.save();

    const issuer = "ArabTrade";
    const account = encodeURIComponent(user.email);
    const otpauth =
      `otpauth://totp/${issuer}:${account}` +
      `?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    return NextResponse.json({
      success: true,
      secret,
      otpauth,
      message: "امسح رمز OTP باستخدام تطبيق المصادقة ثم أرسل الرمز للتحقق",
    });
  }

  if (!record) {
    return NextResponse.json({ success: false, message: "لم يتم إعداد المصادقة الثنائية" }, { status: 400 });
  }

  if (action === "verify") {
    if (!verifyTotp(record.secret, token)) {
      return NextResponse.json({ success: false, message: "رمز المصادقة غير صحيح" }, { status: 400 });
    }

    record.enabled = true;
    record.verifiedAt = new Date();
    await record.save();

    return NextResponse.json({
      success: true,
      enabled: true,
      backupCodes: record.backupCodes,
    });
  }

  if (action === "disable") {
    if (!record.enabled || !verifyTotp(record.secret, token)) {
      return NextResponse.json({ success: false, message: "رمز المصادقة غير صحيح" }, { status: 400 });
    }

    record.enabled = false;
    await record.save();

    return NextResponse.json({ success: true, enabled: false });
  }

  return NextResponse.json({ success: false, message: "عملية غير معروفة" }, { status: 400 });
}