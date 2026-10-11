import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import VerificationRequest from "@/models/VerificationRequest";

export async function GET(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const requests = await VerificationRequest.find({
    userId: user._id,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return NextResponse.json({
    success: true,
    requests,
    verified: Boolean(user.isVerified),
  });
}

export async function POST(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  if (user.isVerified) {
    return NextResponse.json(
      { success: false, message: "الحساب موثق بالفعل" },
      { status: 409 }
    );
  }

  const pending = await VerificationRequest.findOne({
    userId: user._id,
    status: "pending",
  });

  if (pending) {
    return NextResponse.json(
      { success: false, message: "لديك طلب تحقق قيد المراجعة" },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const fullName = String(body.fullName || "").trim();
  const country = String(body.country || "").trim();
  const documentType = String(body.documentType || "");
  const documentNumber = String(body.documentNumber || "").trim();

  if (
    !fullName ||
    !country ||
    !["passport", "national_id", "driver_license"].includes(documentType) ||
    !documentNumber
  ) {
    return NextResponse.json(
      { success: false, message: "بيانات التحقق غير مكتملة" },
      { status: 400 }
    );
  }

  const verification = await VerificationRequest.create({
    userId: user._id,
    fullName,
    country,
    documentType: documentType as "passport" | "national_id" | "driver_license",
    documentNumber,
    status: "pending",
  });

  return NextResponse.json(
    {
      success: true,
      message: "تم إرسال طلب التحقق للمراجعة",
      verification,
    },
    { status: 201 }
  );
}