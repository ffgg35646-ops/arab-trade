import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import DepositRequest from "@/models/DepositRequest";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import KycRequest from "@/models/KycRequest";

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

    const [withdrawals, deposits, kyc] = await Promise.all([
      WithdrawalRequest.countDocuments({ status: "pending" } as any),
      DepositRequest.countDocuments({ status: "pending" } as any),
      KycRequest.countDocuments({ status: "pending" }),
    ]);

    return NextResponse.json({
      success: true,
      counts: {
        withdrawals,
        deposits,
        kyc,
        total: withdrawals + deposits + kyc,
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