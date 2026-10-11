import { NextRequest, NextResponse } from "next/server";


function generateArabTradeId() {
  return Math.floor(10000000 + Math.random() * 90000000);
}
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { sendVerificationCode } from "@/lib/mail";
import { encryptPending } from "@/lib/pending-registration";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validUsername(username: string) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function validName(name: string) {
  return /^[\p{L}\p{M} ]{2,60}$/u.test(name);
}

function hashOtp(code: string) {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const name = String(body.name || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    const referralCode = String(body.referralCode || "").trim();

    // الاسم
    if (!validName(name)) {
      return NextResponse.json(
        { message: "الاسم غير صالح" },
        { status: 400 }
      );
    }

    // Username
    if (!validUsername(username)) {
      return NextResponse.json(
        {
          message:
            "اسم المستخدم يجب أن يكون من 3 إلى 30 حرفًا أو رقمًا أو _",
        },
        { status: 400 }
      );
    }

    // Email
    if (!validEmail(email)) {
      return NextResponse.json(
        { message: "البريد الإلكتروني غير صحيح" },
        { status: 400 }
      );
    }

    // Password
    if (password.length < 8) {
      return NextResponse.json(
        { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { message: "تأكيد كلمة المرور غير مطابق" },
        { status: 400 }
      );
    }

    await connectDB();

    // فحص الإيميل واليوزر قبل إرسال الكود
    const existing = await User.findOne({
      $or: [{ email }, { username }],
    }).select("email username");

    if (existing?.email === email) {
      return NextResponse.json(
        { message: "هذا البريد الإلكتروني مستخدم بالفعل" },
        { status: 409 }
      );
    }

    if (existing?.username === username) {
      return NextResponse.json(
        { message: "اسم المستخدم مستخدم بالفعل" },
        { status: 409 }
      );
    }

    // ==============================================
    // Referral
    // ==============================================

    let referredBy: string | undefined;

    if (referralCode) {
      const referrer = await User.findOne({
        referralCode,
        isActive: true,
      }).select("_id");

      // مهم جدًا:
      // كود إحالة مكتوب لكنه غير موجود = رفض العملية
      if (!referrer) {
        return NextResponse.json(
          { message: "رابط الإحالة أو كود الإحالة غير صالح" },
          { status: 400 }
        );
      }

      referredBy = referrer._id.toString();
    }

    // ==============================================
    // OTP
    // ==============================================

    const arabTradeId = generateArabTradeId();

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashOtp(otp);

    const passwordHash = await bcrypt.hash(password, 12);

    const expiresAt = Date.now() + 10 * 60 * 1000;

    const token = await encryptPending({
      arabTradeId,
      name,
      username,
      email,
      passwordHash,
      otpHash,
      referralCode: referredBy,
      expiresAt,
    });

    await sendVerificationCode(email, otp);

    const response = NextResponse.json({
      success: true,
      message: "تم إرسال كود التفعيل إلى بريدك الإلكتروني",
      expiresIn: 600,
    });

    response.cookies.set("arabtrade_pending_registration", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    return NextResponse.json(
      { message: "حدث خطأ أثناء إنشاء طلب التسجيل" },
      { status: 500 }
    );
  }
}