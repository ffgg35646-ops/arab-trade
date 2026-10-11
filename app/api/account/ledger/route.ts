import { NextRequest, NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import LedgerEntry from "@/models/LedgerEntry";

export async function GET(
  request: NextRequest
) {
  try {
    await connectDB();

    const user =
      await getCurrentUser(
        request
      );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 401 }
      );
    }

    const url =
      new URL(request.url);

    const limit = Math.min(
      Math.max(
        Number(
          url.searchParams.get(
            "limit"
          ) || 100
        ),
        1
      ),
      500
    );

    const asset =
      String(
        url.searchParams.get(
          "asset"
        ) || ""
      )
        .trim()
        .toUpperCase();

    const mode =
      String(
        url.searchParams.get(
          "mode"
        ) || "live"
      )
        .trim()
        .toLowerCase() === "demo"
        ? "demo"
        : "live";

    const type =
      String(
        url.searchParams.get(
          "type"
        ) || ""
      ).trim();

    const filter: Record<
      string,
      unknown
    > = {
      userId: user._id,
      mode,
    };

    if (asset) {
      filter.asset = asset;
    }

    if (type) {
      filter.type = type;
    }

    const entries =
      await LedgerEntry.find(
        filter
      )
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean();

    return NextResponse.json({
      success: true,
      entries,
    });
  } catch (error) {
    console.error(
      "ACCOUNT LEDGER ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر تحميل سجل الحساب",
      },
      { status: 500 }
    );
  }
}