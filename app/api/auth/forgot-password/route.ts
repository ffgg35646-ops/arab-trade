import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import PasswordResetToken from "@/models/PasswordResetToken";
import { sendPasswordResetLink } from "@/lib/mail";

export const runtime = "nodejs";
const generic = "إذا كان البريد مسجلاً لدينا، ستصلك رسالة لاستعادة كلمة المرور.";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254)
      return NextResponse.json({ message: "أدخل بريدًا إلكترونيًا صحيحًا" }, { status: 400 });
    await connectDB();
    const user = await User.findOne({ email }).select("_id email");
    if (user) {
      const recent = await PasswordResetToken.findOne({ userId: user._id, createdAt: { $gt: new Date(Date.now() - 60_000) } });
      if (!recent) {
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const record = await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt: new Date(Date.now() + 15 * 60_000) });
        const configuredOrigin = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
        if (!configuredOrigin) throw new Error("Configure APP_URL for password reset links");
        const url = new URL("/reset-password", configuredOrigin);
        url.searchParams.set("token", token);
        try { await sendPasswordResetLink(email, url.toString()); }
        catch (error) { await PasswordResetToken.deleteOne({ _id: record._id }); throw error; }
      }
    }
    return NextResponse.json({ success: true, message: generic });
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR", error);
    return NextResponse.json({ message: "تعذر إرسال الطلب حاليًا. حاول لاحقًا." }, { status: 500 });
  }
}
