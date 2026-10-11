
import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";

export async function GET(
  request: NextRequest
) {
  try {
    const admin =
      await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "غير مصرح",
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      admin: {
        id: String(admin._id),
        name: admin.name,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        authenticated: false,
        error:
          error?.message ||
          "غير مصرح",
      },
      { status: 401 }
    );
  }
}