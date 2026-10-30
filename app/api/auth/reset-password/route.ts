import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import PasswordResetToken from "@/models/PasswordResetToken";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ message: "رابط الاستعادة غير صالح" }, { status: 400 });
    if (password.length < 8 || password.length > 128) return NextResponse.json({ message: "كلمة المرور يجب أن تكون بين 8 و128 حرفًا" }, { status: 400 });
    await connectDB();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const record = await PasswordResetToken.findOneAndDelete({ tokenHash, expiresAt: { $gt: new Date() } });
    if (!record) return NextResponse.json({ message: "الرابط منتهي الصلاحية أو مستخدم بالفعل. اطلب رابطًا جديدًا." }, { status: 400 });
    const passwordHash = await bcrypt.hash(password, 12);
    await User.updateOne({ _id: record.userId }, { $set: { password: passwordHash } });
    await PasswordResetToken.deleteMany({ userId: record.userId });
    return NextResponse.json({ success: true, message: "تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن." });
  } catch (error) {
    console.error("RESET_PASSWORD_ERROR", error);
    return NextResponse.json({ message: "تعذر تغيير كلمة المرور حاليًا." }, { status: 500 });
  }
}
