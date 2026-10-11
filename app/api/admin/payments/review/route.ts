
import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import PaymentMethod from "@/models/PaymentMethod";

export async function GET(request: NextRequest) {
  try {
    await requireAdminLeader(request);
    await connectDB();

    const methods = await PaymentMethod.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ methods });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "غير مصرح" },
      { status: 401 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdminLeader(request);
    await connectDB();

    const body = await request.json();
    const id = String(body.id || "");

    if (!id || typeof body.verified !== "boolean") {
      return NextResponse.json(
        { error: "بيانات المراجعة غير صحيحة" },
        { status: 400 }
      );
    }

    const method = await PaymentMethod.findByIdAndUpdate(
      id,
      {
        $set: {
          verified: body.verified
        }
      },
      { new: true }
    );

    if (!method) {
      return NextResponse.json(
        { error: "وسيلة الدفع غير موجودة" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      method
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "فشل المراجعة" },
      { status: 400 }
    );
  }
}