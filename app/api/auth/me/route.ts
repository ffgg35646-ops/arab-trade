import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

const secretText = process.env.AUTH_SECRET;

export async function GET(request: NextRequest) {
  try {
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

    return NextResponse.json({
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
  } catch (error) {
    console.error("ME ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل بيانات الحساب" },
      { status: 500 }
    );
  }
}