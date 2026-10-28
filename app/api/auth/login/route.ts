import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const secretText = process.env.AUTH_SECRET;
  if (!secretText) {
    return NextResponse.json(
      { success: false, message: "إعدادات تسجيل الدخول غير مكتملة على الخادم" },
      { status: 503 }
    );
  }
  const secret = new TextEncoder().encode(secretText);

  const clientKey =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const RATE_LIMIT_login = rateLimit("login:" + clientKey, 10, 60000);
  if (!RATE_LIMIT_login.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((RATE_LIMIT_login.resetAt - Date.now()) / 1000)
    );
    return NextResponse.json(
      {
        error: "تم تجاوز عدد الطلبات المسموح بها مؤقتًا",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    const body = await request.json();
    const identifier = String(body.identifier || "").trim().toLowerCase();
    const password = String(body.password || "");
    const remember = body.remember !== false;
    const sessionDays = remember ? 30 : 7;

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, message: "أدخل اسم المستخدم أو البريد الإلكتروني وكلمة المرور" },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    }).select("+password");

    if (!user) {
      return NextResponse.json(
        { success: false, message: "بيانات تسجيل الدخول غير صحيحة" },
        { status: 401 }
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, message: "بيانات تسجيل الدخول غير صحيحة" },
        { status: 401 }
      );
    }

    if (!user.isVerified) {
      return NextResponse.json(
        { success: false, message: "يجب تأكيد البريد الإلكتروني أولًا" },
        { status: 403 }
      );
    }

    if (user.approvalStatus === "pending") {
      return NextResponse.json(
        {
          success: false,
          message: "تم تأكيد بريدك الإلكتروني، وحسابك قيد مراجعة الإدارة. ستتمكن من الدخول بعد الموافقة.",
        },
        { status: 403 }
      );
    }

    if (user.approvalStatus === "rejected") {
      const reason = user.rejectionReason?.trim();
      return NextResponse.json(
        {
          success: false,
          message: reason
            ? "لم تتم الموافقة على إنشاء الحساب. سبب الرفض: " + reason
            : "لم تتم الموافقة على إنشاء الحساب. تواصل مع الدعم إذا كنت ترى أن ذلك خطأ.",
        },
        { status: 403 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, message: "الحساب غير مفعل حاليًا" },
        { status: 403 }
      );
    }

    const token = await new SignJWT({
      userId: String(user._id),
      username: user.username,
      email: user.email,
      remember,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${sessionDays}d`)
      .sign(secret);

    const response = NextResponse.json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      user: {
        id: String(user._id),
        name: user.name,
        username: user.username,
        email: user.email,
      },
    });

    response.cookies.set("arabtrade_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * sessionDays,
    });
    return response;
  } catch (error) {
    console.error("LOGIN ERROR:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, message: "حدث خطأ أثناء تسجيل الدخول" },
      { status: 500 }
    );
  }
}
