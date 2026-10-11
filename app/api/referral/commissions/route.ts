import { NextRequest, NextResponse } from "next/server";
import { connectDB as dbConnect } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import ReferralCommission from "@/models/ReferralCommission";

export async function GET(request: NextRequest) {
  await dbConnect();

  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

  const commissions = await ReferralCommission.find({ referrerId: user._id })
    .populate("referredUserId", "name username email")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const totals = commissions.reduce(
    (acc: any, row: any) => {
      acc.total += Number(row.amount || 0);
      if (row.status === "pending") acc.pending += Number(row.amount || 0);
      if (row.status === "available") acc.available += Number(row.amount || 0);
      if (row.status === "paid") acc.paid += Number(row.amount || 0);
      return acc;
    },
    { total: 0, pending: 0, available: 0, paid: 0 }
  );

  return NextResponse.json({
    success: true,
    commissions,
    totals,
  });
}