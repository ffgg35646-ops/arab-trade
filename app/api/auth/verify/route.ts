import Notification from "@/models/Notification";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import {
  decryptPending,
} from "@/lib/pending-registration";

function hashOtp(code: string) {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}

function makeReferralCode() {
  return crypto
    .randomBytes(6)
    .toString("hex")
    .toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!/^\d{6}$/.test(String(code || ""))) {
      return NextResponse.json(
        { message: "كود التفعيل يجب أن يكون 6 أرقام" },
        { status: 400 }
      );
    }

    const token = req.cookies.get(
      "arabtrade_pending_registration"
    )?.value;

    if (!token) {
      return NextResponse.json(
        {
          message:
            "انتهت جلسة التسجيل. ابدأ التسجيل من جديد.",
        },
        { status: 400 }
      );
    }

    let pending;

    try {
      pending = await decryptPending(token);
    } catch {
      return NextResponse.json(
        {
          message:
            "انتهت صلاحية كود التفعيل. ابدأ التسجيل من جديد.",
        },
        { status: 400 }
      );
    }

    if (Date.now() > Number(pending.expiresAt)) {
      const response = NextResponse.json(
        {
          message:
            "انتهت صلاحية كود التفعيل. ابدأ التسجيل من جديد.",
        },
        { status: 400 }
      );

      response.cookies.delete("arabtrade_pending_registration");
      return response;
    }

    if (hashOtp(String(code)) !== pending.otpHash) {
      return NextResponse.json(
        { message: "كود التفعيل غير صحيح" },
        { status: 400 }
      );
    }

    await connectDB();

    // إعادة الفحص لحظة إنشاء الحساب
    // لمنع السباق إذا سجل شخص بنفس البيانات أثناء التحقق
    const existing = await User.findOne({
      $or: [
        { email: pending.email },
        { username: pending.username },
      ],
    });

    if (existing) {
      return NextResponse.json(
        {
          message:
            "البريد الإلكتروني أو اسم المستخدم أصبح مستخدمًا بالفعل",
        },
        { status: 409 }
      );
    }

    // إعادة التحقق من صاحب الإحالة
    let referredBy = null;

    if (pending.referralCode) {
      const referrer = await User.findOne({
        _id: pending.referralCode,
        isActive: true,
      }).select("_id");

      if (!referrer) {
        return NextResponse.json(
          {
            message:
              "صاحب رابط الإحالة لم يعد متاحًا، لم يتم إنشاء الحساب.",
          },
          { status: 400 }
        );
      }

      referredBy = referrer._id;
    }

    // إنشاء Referral Code فريد
    let newReferralCode = makeReferralCode();

    while (
      await User.exists({
        referralCode: newReferralCode,
      })
    ) {
      newReferralCode = makeReferralCode();
    }

    const user = await User.create({
      arabTradeId: pending.arabTradeId,
      name: pending.name,
      username: pending.username,
      email: pending.email,
      password: pending.passwordHash,
      referralCode: newReferralCode,
      referredBy,
      isVerified: true,
      isActive: true,
    });

    const response = NextResponse.json({
      success: true,
      message: "تم تفعيل حسابك وإنشاؤه بنجاح",
      userId: user._id.toString(),
    });

    response.cookies.delete("arabtrade_pending_registration");

    return response;
  } catch (error) {
    console.error("VERIFY ERROR:", error);

    return NextResponse.json(
      { message: "حدث خطأ أثناء تفعيل الحساب" },
      { status: 500 }
    );
  }
}