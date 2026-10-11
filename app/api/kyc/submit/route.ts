
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import VerificationRequest from "@/models/VerificationRequest";
import { submitKyc } from "@/lib/kyc-provider";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "غير مصرح" },
        { status: 401 }
      );
    }

    await connectDB();

    const body = await request.json();

    const fullName = String(body.fullName || "").trim();
    const country = String(body.country || "").trim();
    const documentType = String(body.documentType || "");
    const documentNumber = String(
      body.documentNumber || ""
    ).trim();

    if (
      !fullName ||
      !country ||
      !documentNumber ||
      ![
        "passport",
        "national_id",
        "driver_license"
      ].includes(documentType)
    ) {
      return NextResponse.json(
        { error: "بيانات التحقق غير مكتملة" },
        { status: 400 }
      );
    }

    const requestRow =
      await VerificationRequest.findOneAndUpdate(
        {
          userId: user._id,
          status: { $in: ["pending", "approved"] }
        },
        {
          userId: user._id,
          fullName,
          country,
          documentType:
            documentType as
              | "passport"
              | "national_id"
              | "driver_license",
          documentNumber,
          status: "pending"
        },
        {
          upsert: true,
          new: true
        }
      );

    const provider = await submitKyc({
      userId: String(user._id),
      fullName,
      country,
      documentType,
      documentNumber
    });

    return NextResponse.json({
      success: true,
      request: requestRow,
      provider
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "تعذر إرسال طلب التحقق"
      },
      { status: 400 }
    );
  }
}