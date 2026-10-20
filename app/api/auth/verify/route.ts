import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import KycRequest from "@/models/KycRequest";
import PendingRegistrationIdentity from "@/models/PendingRegistrationIdentity";
import { decryptPending } from "@/lib/pending-registration";

function hashOtp(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function makeReferralCode() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

export async function POST(req: NextRequest) {
  let createdUserId: string | undefined;
  let createdKycId: string | undefined;

  try {
    const { code } = await req.json();

    if (!/^\d{6}$/.test(String(code || ""))) {
      return NextResponse.json(
        { message: "كود التفعيل يجب أن يكون 6 أرقام" },
        { status: 400 }
      );
    }

    const token = req.cookies.get("arabtrade_pending_registration")?.value;
    if (!token) {
      return NextResponse.json(
        { message: "انتهت جلسة التسجيل. ابدأ التسجيل من جديد." },
        { status: 400 }
      );
    }

    let pending;
    try {
      pending = await decryptPending(token);
    } catch {
      const response = NextResponse.json(
        { message: "انتهت صلاحية كود التفعيل. ابدأ التسجيل من جديد." },
        { status: 400 }
      );
      response.cookies.delete("arabtrade_pending_registration");
      return response;
    }

    if (
      Date.now() > Number(pending.expiresAt) ||
      !pending.registrationId
    ) {
      const response = NextResponse.json(
        { message: "انتهت صلاحية كود التفعيل. ابدأ التسجيل من جديد." },
        { status: 400 }
      );
      response.cookies.delete("arabtrade_pending_registration");
      return response;
    }

    if (hashOtp(String(code)) !== pending.otpHash) {
      return NextResponse.json(
        { message: "كود التفعيل غير صحيح" },
        { status: 400 }
      );
    }

    await connectDB();

    const identity = await PendingRegistrationIdentity.findOne({
      registrationId: pending.registrationId,
    });
    if (!identity || identity.expiresAt.getTime() < Date.now()) {
      await PendingRegistrationIdentity.deleteOne({
        registrationId: pending.registrationId,
      }).catch(() => {});
      const response = NextResponse.json(
        { message: "انتهت صلاحية صور التسجيل. ابدأ التسجيل من جديد." },
        { status: 400 }
      );
      response.cookies.delete("arabtrade_pending_registration");
      return response;
    }

    const existing = await User.findOne({
      $or: [{ email: pending.email }, { username: pending.username }],
    });
    if (existing) {
      return NextResponse.json(
        { message: "البريد الإلكتروني أو اسم المستخدم أصبح مستخدمًا بالفعل" },
        { status: 409 }
      );
    }

    let referredBy = null;
    if (pending.referralCode) {
      const referrer = await User.findOne({
        _id: pending.referralCode,
        isActive: true,
      }).select("_id");

      if (!referrer) {
        return NextResponse.json(
          { message: "صاحب رابط الإحالة لم يعد متاحًا، لم يتم إنشاء الحساب." },
          { status: 400 }
        );
      }
      referredBy = referrer._id;
    }

    let newReferralCode = makeReferralCode();
    while (await User.exists({ referralCode: newReferralCode })) {
      newReferralCode = makeReferralCode();
    }

    const user = await User.create({
      arabTradeId: pending.arabTradeId,
      name: pending.name,
      username: pending.username,
      email: pending.email,
      password: pending.passwordHash,
      referralCode: newReferralCode,
      referredBy,
      isVerified: true,
      isActive: false,
      approvalStatus: "pending",
    });
    createdUserId = user._id.toString();

    const kyc = await KycRequest.create({
      userId: user._id,
      fullName: pending.name,
      dateOfBirth: "غير مطلوب عند التسجيل",
      nationality: "غير محدد",
      documentType: "national_id",
      documentNumber: "مرفق صور الهوية",
      issuingCountry: "غير محدد",
      documentPath: "mongodb://identity-front",
      selfiePath: "mongodb://identity-selfie",
      identityFrontData: identity.identityFrontData,
      identityFrontMime: identity.identityFrontMime,
      identityBackData: identity.identityBackData,
      identityBackMime: identity.identityBackMime,
      selfieData: identity.selfieData,
      selfieMime: identity.selfieMime,
      status: "pending",
    });
    createdKycId = kyc._id.toString();

    await PendingRegistrationIdentity.deleteOne({
      registrationId: pending.registrationId,
    });

    const response = NextResponse.json({
      success: true,
      message: "تم تأكيد البريد الإلكتروني. حسابك الآن قيد مراجعة الإدارة، وسيصبح متاحًا بعد الموافقة.",
      userId: user._id.toString(),
      accountStatus: "pending",
    });
    response.cookies.delete("arabtrade_pending_registration");
    createdUserId = undefined;
    createdKycId = undefined;
    return response;
  } catch (error) {
    if (createdKycId) {
      await KycRequest.deleteOne({ _id: createdKycId }).catch(() => {});
    }
    if (createdUserId) {
      await User.deleteOne({ _id: createdUserId }).catch(() => {});
    }
    console.error("VERIFY ERROR:", error);
    return NextResponse.json(
      { message: "حدث خطأ أثناء تأكيد البريد وإنشاء طلب المراجعة" },
      { status: 500 }
    );
  }
}
