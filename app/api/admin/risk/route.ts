import { NextRequest, NextResponse } from "next/server";

import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import {
  evaluateAdminRisk,
  AdminRiskAction,
} from "@/lib/admin-risk";

const validActions: AdminRiskAction[] = [
  "withdrawal_approve",
  "withdrawal_reject",
  "asset_change",
  "trading_settings_change",
  "user_status_change",
  "manual_balance_change",
];

export async function GET(request: NextRequest) {
  const admin =
    await requireAdminLeader(request);

  if (!admin) {
    return NextResponse.json(
      {
        success: false,
        message: "غير مصرح",
      },
      { status: 403 }
    );
  }

  await connectDB();

  const actionParam =
    request.nextUrl.searchParams.get("action") || "";

  if (
    actionParam &&
    !validActions.includes(
      actionParam as AdminRiskAction
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "إجراء غير صالح",
      },
      { status: 400 }
    );
  }

  if (!actionParam) {
    return NextResponse.json({
      success: true,
      actions: validActions.map((action) => ({
        action,
        decision:
          evaluateAdminRisk(action),
      })),
    });
  }

  const amountText =
    request.nextUrl.searchParams.get("amount");

  const amount =
    amountText === null
      ? undefined
      : Number(amountText);

  const decision =
    evaluateAdminRisk(
      actionParam as AdminRiskAction,
      { amount }
    );

  return NextResponse.json({
    success: true,
    action: actionParam,
    decision,
  });
}
