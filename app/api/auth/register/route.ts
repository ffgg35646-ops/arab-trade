import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import PendingRegistrationIdentity from "@/models/PendingRegistrationIdentity";
import { sendVerificationCode } from "@/lib/mail";
import { encryptPending } from "@/lib/pending-registration";

const MAX_FILE_SIZE = 900 * 1024;
const MAX_TOTAL_FILE_SIZE = 2650 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function generateArabTradeId() {
  return Math.floor(10000000 + Math.random() * 90000000);
}

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
  return crypto.createHash("sha256").update(code).digest("hex");
}

function hasValidImageSignature(type: string, bytes: Buffer) {
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (type === "image/webp") {
    return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

type IdentityImage = { data: Buffer; mime: string; size: number };

async function readIdentityImage(value: FormDataEntryValue | null, label: string): Promise<IdentityImage> {
  if (!(value instanceof File) || value.size === 0) {
    throw new Error(`يجب رفع ${label}`);
  }
  if (!ALLOWED_TYPES.has(value.type)) {
    throw new Error("صور الهوية المسموح بها JPG أو PNG أو WEBP فقط");
  }
  if (value.size > MAX_FILE_SIZE) {
    throw new Error("حجم كل صورة يجب ألا يتجاوز 900 كيلوبايت. اختر صورة أوضح بعد ضغطها.");
  }

  const data = Buffer.from(await value.arrayBuffer());
  if (!hasValidImageSignature(value.type, data)) {
    throw new Error("أحد الملفات ليس صورة سليمة من نوع JPG أو PNG أو WEBP");
  }
  return { data, mime: value.type, size: value.size };
}

export async function POST(req: NextRequest) {
  let savedRegistrationId: string | undefined;

  try {
    const form = await req.formData();
    const field = (key: string) => String(form.get(key) || "").trim();

    const name = field("name");
    const username = field("username").toLowerCase();
    const email = field("email").toLowerCase();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    const referralCode = field("referralCode").toUpperCase();

    if (!validName(name)) {
      return NextResponse.json({ message: "الاسم غير صالح" }, { status: 400 });
    }
    if (!validUsername(username)) {
      return NextResponse.json(
        { message: "اسم المستخدم يجب أن يكون من 3 إلى 30 حرفًا أو رقمًا أو _" },
        { status: 400 }
      );
    }
    if (!validEmail(email)) {
      return NextResponse.json({ message: "البريد الإلكتروني غير صحيح" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" },
        { status: 400 }
      );
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ message: "تأكيد كلمة المرور غير مطابق" }, { status: 400 });
    }

    let identityFront: IdentityImage;
    let identityBack: IdentityImage;
    let selfie: IdentityImage;
    try {
      identityFront = await readIdentityImage(form.get("identityFront"), "الوجه الأمامي للهوية");
      identityBack = await readIdentityImage(form.get("identityBack"), "الوجه الخلفي للهوية");
      selfie = await readIdentityImage(form.get("identitySelfie"), "صورة الشخص وهو ممسك بالهوية");
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "تعذر قراءة صور الهوية" },
        { status: 400 }
      );
    }

    if (identityFront.size + identityBack.size + selfie.size > MAX_TOTAL_FILE_SIZE) {
      return NextResponse.json(
        { message: "إجمالي أحجام صور الهوية كبير؛ قلّل حجم الصور وحاول مرة أخرى." },
        { status: 400 }
      );
    }

    await connectDB();

    const existing = await User.findOne({ $or: [{ email }, { username }] }).select("email username");
    if (existing?.email === email) {
      return NextResponse.json({ message: "هذا البريد الإلكتروني مستخدم بالفعل" }, { status: 409 });
    }
    if (existing?.username === username) {
      return NextResponse.json({ message: "اسم المستخدم مستخدم بالفعل" }, { status: 409 });
    }

    let referredBy: string | undefined;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode, isActive: true }).select("_id");
      if (!referrer) {
        return NextResponse.json({ message: "رابط الإحالة أو كود الإحالة غير صالح" }, { status: 400 });
      }
      referredBy = referrer._id.toString();
    }

    const registrationId = crypto.randomUUID();
    savedRegistrationId = registrationId;
    const otp = crypto.randomInt(100000, 1000000).toString();
    const passwordHash = await bcrypt.hash(password, 12);
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await PendingRegistrationIdentity.create({
      registrationId,
      identityFrontData: identityFront.data,
      identityFrontMime: identityFront.mime,
      identityBackData: identityBack.data,
      identityBackMime: identityBack.mime,
      selfieData: selfie.data,
      selfieMime: selfie.mime,
      expiresAt: new Date(expiresAt),
    });

    const token = await encryptPending({
      arabTradeId: generateArabTradeId(),
      name,
      username,
      email,
      passwordHash,
      otpHash: hashOtp(otp),
      referralCode: referredBy,
      registrationId,
      expiresAt,
    });

    try {
      await sendVerificationCode(email, otp);
    } catch (error) {
      await PendingRegistrationIdentity.deleteOne({ registrationId });
      savedRegistrationId = undefined;
      throw error;
    }

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
    if (savedRegistrationId) {
      await PendingRegistrationIdentity.deleteOne({ registrationId: savedRegistrationId }).catch(() => {});
    }
    console.error("REGISTER ERROR:", error);
    return NextResponse.json(
      { message: "حدث خطأ أثناء إنشاء طلب التسجيل. حاول مرة أخرى." },
      { status: 500 }
    );
  }
}
