import { NextRequest, NextResponse } from "next/server";
import { releaseOrderLock } from "@/lib/matching-engine";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import { getCurrentUser } from "@/lib/current-user";
import { cancelBinanceLiveOrder } from "@/lib/binance-live-orders";

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

    const mode = "live";

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

    const externalOrder = await Order.findOne({
      _id: id,
      userId: user._id,
      mode,
      executionProvider: "binance",
      status: "open",
    }).select("_id").lean();

    if (externalOrder) {
      try {
        const cancelled = await cancelBinanceLiveOrder(String(externalOrder._id), user._id);
        return NextResponse.json({
          success: true,
          message: "تم إرسال الإلغاء إلى Binance وتحديث حالة الأمر حسب رد السوق.",
          order: cancelled.order,
        });
      } catch (externalError) {
        console.error("BINANCE ORDER CANCEL:", externalError);
        return NextResponse.json({
          success: false,
          message: externalError instanceof Error ? externalError.message : "تعذر إلغاء الأمر لدى Binance.",
        }, { status: 502 });
      }
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