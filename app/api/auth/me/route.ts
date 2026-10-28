import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function GET(request: NextRequest) {
  try {
    const secretText = process.env.AUTH_SECRET;
    if (!secretText) {
      return NextResponse.json(
        { success: false, message: "AUTH_SECRET is not configured" },
        { status: 500 }
      );
    }

    const token = request.cookies.get("arabtrade_session")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    const secret = new TextEncoder().encode(secretText);
    const { payload } = await jwtVerify(token, secret);

    const userId = String(payload.userId || "");

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "جلسة غير صالحة" },
        { status: 401 }
      );
    }

    await connectDB();

    const user = await User.findById(userId).select(
      "name username email referralCode isVerified isActive createdAt"
    );

    if (!user || !user.isActive) {
      return NextResponse.json(
        { success: false, message: "الحساب غير متاح" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: String(user._id),
        name: user.name,
        username: user.username,
        email: user.email,
        referralCode: user.referralCode,
        isVerified: user.isVerified,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });

    const remainingSeconds =
      typeof payload.exp === "number"
        ? payload.exp - Math.floor(Date.now() / 1000)
        : 0;

    if (payload.remember === true && remainingSeconds < 15 * 24 * 60 * 60) {
      const renewedToken = await new SignJWT({
        userId: String(user._id),
        username: user.username,
        email: user.email,
        remember: true,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(secret);

      response.cookies.set("arabtrade_session", renewedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (error) {
    console.error("ME ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل بيانات الحساب" },
      { status: 500 }
    );
  }
}