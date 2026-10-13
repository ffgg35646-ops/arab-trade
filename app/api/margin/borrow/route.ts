import { NextRequest, NextResponse } from "next/server";

import { requireVerifiedIdentity } from "@/lib/require-kyc";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";

import MarginLoan from "@/models/MarginLoan";
import MarginPosition from "@/models/MarginPosition";

export async function POST(
  request: NextRequest
) {
  try {
    const kyc =
      await requireVerifiedIdentity(
        request
      );

    if (!kyc.ok) {
      return NextResponse.json(
        {
          success: false,
          message: kyc.message,
        },
        { status: kyc.status }
      );
    }

    const user =
      await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 401 }
      );
    }

    await connectDB();
    await migrateLegacyDepositBalancesToSpotWallet(user._id);

    /*
     * الاقتراض المستقل ممنوع.
     *
     * إنشاء القرض يتم فقط من:
     * /api/margin/open
     *
     * لمنع قروض شاردة أو أموال مصطنعة.
     */
    const positionId =
      String(
        (await request.json().catch(
          () => ({})
        ))?.positionId || ""
      );

    if (!positionId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "الاقتراض يجب أن يكون مرتبطًا بمركز مارجن مفتوح.",
        },
        { status: 400 }
      );
    }

    const position =
      await MarginPosition.findOne({
        _id: positionId,
        userId: user._id,
        status: "open",
      });

    if (!position) {
      return NextResponse.json(
        {
          success: false,
          message:
            "مركز المارجن غير موجود",
        },
        { status: 404 }
      );
    }

    const existing =
      await MarginLoan.findOne({
        positionId:
          position._id,
        userId: user._id,
        status: "active",
      });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message:
            "القرض لهذا المركز موجود بالفعل",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message:
          "إنشاء قرض مستقل غير مسموح. افتح المركز من شاشة الهامش.",
      },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر تنفيذ الاقتراض",
      },
      { status: 400 }
    );
  }
}
