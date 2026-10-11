
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import MarginLoan from "@/models/MarginLoan";
import { calculateMarginInterest } from "@/lib/margin-interest";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const loanId = String(body.loanId || "");
    const annualRate = Number(body.annualRate || 0);
    const elapsedHours = Number(body.elapsedHours || 0);

    const loan = await MarginLoan.findOne({
      _id: loanId,
      userId: user._id,
      status: "active"
    });

    if (!loan) {
      return NextResponse.json(
        { error: "القرض غير موجود" },
        { status: 404 }
      );
    }

    const interest = calculateMarginInterest(
      Number(loan.outstanding),
      annualRate,
      elapsedHours
    );

    loan.interestRate = annualRate;
    loan.updatedAt = new Date();
    await loan.save();

    return NextResponse.json({
      success: true,
      loan,
      calculatedInterest: interest
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر حساب الفائدة" },
      { status: 400 }
    );
  }
}