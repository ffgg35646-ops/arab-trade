import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "جميع الحقول مطلوبة" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "تأكيد كلمة المرور غير مطابق" },
        { status: 400 }
      );
    }

    await connectDB();

    const userWithPassword = await user.populate({
      path: "_id",
      select: "+password",
    });

    const fullUser = await (await import("@/models/User")).default
      .findById(user._id)
      .select("+password");

    if (!fullUser) {
      return NextResponse.json(
        { success: false, message: "الحساب غير موجود" },
        { status: 404 }
      );
    }

    const valid = await bcrypt.compare(
      currentPassword,
      fullUser.password
    );

    if (!valid) {
      return NextResponse.json(
        { success: false, message: "كلمة المرور الحالية غير صحيحة" },
        { status: 400 }
      );
    }

    fullUser.password = await bcrypt.hash(newPassword, 12);
    await fullUser.save();

    return NextResponse.json({
      success: true,
      message: "تم تغيير كلمة المرور. سجّل الدخول مرة أخرى.",
    });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تغيير كلمة المرور" },
      { status: 500 }
    );
  }
}