import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import User from "@/models/User";

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const body = await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const username =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (!name || !username || !email) {
      return NextResponse.json(
        {
          success: false,
          message: "الاسم واسم المستخدم والبريد الإلكتروني مطلوبة",
        },
        { status: 400 }
      );
    }

    if (name.length < 2 || name.length > 60) {
      return NextResponse.json(
        {
          success: false,
          message: "الاسم يجب أن يكون بين 2 و60 حرفًا",
        },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "اسم المستخدم يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط، من 3 إلى 30 حرفًا",
        },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        {
          success: false,
          message: "البريد الإلكتروني غير صحيح",
        },
        { status: 400 }
      );
    }

    const user = await User.findById(currentUser._id);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "الحساب غير موجود",
        },
        { status: 404 }
      );
    }

    const usernameTaken = await User.findOne({
      username,
      _id: { $ne: user._id },
    })
      .select("_id")
      .lean();

    if (usernameTaken) {
      return NextResponse.json(
        {
          success: false,
          message: "اسم المستخدم مستخدم بالفعل",
        },
        { status: 409 }
      );
    }

    const emailTaken = await User.findOne({
      email,
      _id: { $ne: user._id },
    })
      .select("_id")
      .lean();

    if (emailTaken) {
      return NextResponse.json(
        {
          success: false,
          message: "البريد الإلكتروني مستخدم بالفعل",
        },
        { status: 409 }
      );
    }

    user.name = name;
    user.username = username;
    user.email = email;

    await user.save();

    return NextResponse.json({
      success: true,
      message: "تم الحفظ بنجاح",
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
  } catch (error: any) {
    console.error("ACCOUNT PROFILE UPDATE ERROR:", error);

    if (error?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "تعذر حفظ بيانات الحساب",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const user = await User.findById(currentUser._id)
      .select(
        "_id name username email referralCode isVerified isActive createdAt"
      )
      .lean();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "الحساب غير موجود" },
        { status: 404 }
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
  } catch (error: any) {
    console.error("ACCOUNT PROFILE GET ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "تعذر تحميل بيانات الحساب",
      },
      { status: 500 }
    );
  }
}