import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import DepositRequest from "@/models/DepositRequest";
import KycRequest from "@/models/KycRequest";
import WithdrawalRequest from "@/models/WithdrawalRequest";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    await connectDB();

    const [deposits, kyc, withdrawals] = await Promise.all([
      DepositRequest.countDocuments({ status: "pending" } as any),
      KycRequest.countDocuments({ status: "pending" }),
      WithdrawalRequest.countDocuments({ status: "pending" }),
    ]);

    return NextResponse.json({
      success: true,
      counts: {
        deposits,
        kyc,
        withdrawals,
        total: deposits + kyc + withdrawals,
      },
    });
  } catch (error) {
    console.error("ADMIN NOTIFICATION SUMMARY ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل إشعارات الطلبات" },
      { status: 500 }
    );
  }
}