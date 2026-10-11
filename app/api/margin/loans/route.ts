import { requireVerifiedIdentity } from "@/lib/require-kyc";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import MarginLoan from "@/models/MarginLoan";

export async function GET(request: NextRequest) {
  try {
    const kycGuard = await requireVerifiedIdentity(request);

    if (!kycGuard.ok) {
      return NextResponse.json(
        {
          success: false,
          message: kycGuard.message,
        },
        { status: kycGuard.status }
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    await connectDB();

    const loans = await MarginLoan.find({
      userId: user._id
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ loans });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر تحميل القروض" },
      { status: 400 }
    );
  }
}