import { requireVerifiedIdentity } from "@/lib/require-kyc";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import Wallet from "@/models/Wallet";
import MarginLoan from "@/models/MarginLoan";

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const loanId = String(body.loanId || "");
    const amount = Number(body.amount);

    if (!loanId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "بيانات السداد غير صحيحة" },
        { status: 400 }
      );
    }

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

    const wallet = await Wallet.findOne({
      userId: user._id,
      type: "spot"
    });

    if (!wallet) {
      return NextResponse.json(
        { error: "المحفظة غير موجودة" },
        { status: 404 }
      );
    }

    const balance = wallet.balances.find(
      (x: any) => x.asset === loan.asset
    );

    const repay = Math.min(amount, loan.outstanding);

    if (!balance || Number(balance.available || 0) < repay) {
      return NextResponse.json(
        { error: "الرصيد غير كافٍ للسداد" },
        { status: 400 }
      );
    }

    balance.available -= repay;
    loan.outstanding -= repay;

    if (loan.outstanding <= 1e-12) {
      loan.outstanding = 0;
      loan.status = "repaid";
    }

    await wallet.save();
    await loan.save();

    return NextResponse.json({
      success: true,
      repaid: repay,
      loan
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر السداد" },
      { status: 400 }
    );
  }
}