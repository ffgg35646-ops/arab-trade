import { NextRequest, NextResponse } from "next/server";
import { releaseOrderLock } from "@/lib/matching-engine";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import { getCurrentUser } from "@/lib/current-user";

export async function POST(
  request: NextRequest
) {
  try {
    const user =
      await getCurrentUser(
        request
      );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message:
            "غير مسجل الدخول",
        },
        { status: 401 }
      );
    }

    await connectDB();

    const body =
      await request
        .json()
        .catch(() => ({}));

    const id = String(
      body.id || ""
    ).trim();

    const mode =
      String(body.mode || "live")
        .trim()
        .toLowerCase() === "demo"
        ? "demo"
        : "live";

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message:
            "معرف الأمر مطلوب",
        },
        { status: 400 }
      );
    }

    /*
     * نغيّر الحالة من open إلى cancelled
     * مباشرة بدل أن نفك الرصيد أولًا ثم نحفظ.
     *
     * هذا يمنع استدعاء releaseOrderLock
     * مرتين من نفس المسار.
     */
    const order =
      await Order.findOneAndUpdate(
        {
          _id: id,
          userId: user._id,
          mode,
          status: "open",
        },
        {
          $set: {
            status: "cancelled",
          },
        },
        {
          new: true,
        }
      );

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          message:
            "الأمر غير موجود أو غير مفتوح",
        },
        { status: 404 }
      );
    }

    /*
     * releaseOrderLock تعتمد على quantity
     * الحالية، أي الجزء المتبقي فقط.
     */
    await releaseOrderLock(
      String(order._id)
    );

    return NextResponse.json({
      success: true,
      message: "تم إلغاء الأمر",
      order: {
        ...order.toObject(),
        remainingQuantity:
          Number(
            order.quantity || 0
          ),
        filledQuantity:
          Number(
            order.filledQuantity || 0
          ),
      },
    });
  } catch (error) {
    console.error(
      "ORDER CANCEL ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "تعذر إلغاء الأمر",
      },
      { status: 500 }
    );
  }
}