import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import ApiKey from "@/models/ApiKey";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const keys = await ApiKey.find({
      userId: user._id,
    })
      .select("-secretHash")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      keys,
    });
  } catch (error) {
    console.error("API KEYS GET:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل مفاتيح API" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const body = await request.json();
    const name = String(body.name || "").trim();

    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { success: false, message: "اسم المفتاح غير صالح" },
        { status: 400 }
      );
    }

    const key = `at_${crypto.randomBytes(18).toString("hex")}`;
    const secret = crypto.randomBytes(32).toString("hex");
    const secretHash = await bcrypt.hash(secret, 12);

    const apiKey = await ApiKey.create({
      userId: user._id,
      name,
      key,
      secretHash,
      permissions: Array.isArray(body.permissions)
        ? body.permissions
        : ["read"],
      active: true,
    });

    return NextResponse.json(
      {
        success: true,
        message: "تم إنشاء المفتاح. احفظ السر الآن لأنه لن يظهر مرة أخرى.",
        key: apiKey.key,
        secret,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("API KEYS POST:", error);

    return NextResponse.json(
      { success: false, message: "تعذر إنشاء مفتاح API" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const body = await request.json();
    const id = String(body.id || "");

    await ApiKey.updateOne(
      {
        _id: id,
        userId: user._id,
      },
      {
        $set: { active: false },
      }
    );

    return NextResponse.json({
      success: true,
      message: "تم إلغاء المفتاح",
    });
  } catch (error) {
    console.error("API KEYS DELETE:", error);

    return NextResponse.json(
      { success: false, message: "تعذر إلغاء المفتاح" },
      { status: 500 }
    );
  }
}