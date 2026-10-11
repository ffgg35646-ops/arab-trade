import { NextRequest, NextResponse } from "next/server";

import { requireAdminLeader } from "@/lib/admin-auth";
import { runReconciliation } from "@/lib/reconciliation";

export async function GET(
  request: NextRequest
) {
  try {
    await requireAdminLeader(request);

    const result =
      await runReconciliation();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Reconciliation error:",
      error
    );

    if (
      error instanceof Error &&
      error.message === "Unauthorized"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized",
        },
        { status: 401 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "Admin access required"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin access required",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Reconciliation failed",
      },
      { status: 500 }
    );
  }
}
