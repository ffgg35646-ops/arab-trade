import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import PaymentMethod from "@/models/PaymentMethod";

export async function GET(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const methods = await PaymentMethod.find({ userId: user._id })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, methods });
}

export async function POST(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const type = String(body.type || "");
  const label = String(body.label || "").trim();
  const provider = String(body.provider || "").trim();
  const identifier = String(body.identifier || "").trim();

  if (
    !["bank", "wallet", "other"].includes(type) ||
    !label ||
    !identifier
  ) {
    return NextResponse.json(
      { success: false, message: "بيانات طريقة الدفع غير صحيحة" },
      { status: 400 }
    );
  }

  const exists = await PaymentMethod.findOne({
    userId: user._id,
    identifier,
  });

  if (exists) {
    return NextResponse.json(
      { success: false, message: "طريقة الدفع موجودة بالفعل" },
      { status: 409 }
    );
  }

  const count = await PaymentMethod.countDocuments({
    userId: user._id,
  });

  const method = await PaymentMethod.create({
    userId: user._id,
    type: type as "bank" | "wallet" | "other",
    label,
    provider,
    identifier,
    isDefault: count === 0,
    verified: false,
  });

  return NextResponse.json(
    { success: true, method },
    { status: 201 }
  );
}

export async function PATCH(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");

  const method = await PaymentMethod.findOne({
    _id: id,
    userId: user._id,
  });

  if (!method) {
    return NextResponse.json(
      { success: false, message: "طريقة الدفع غير موجودة" },
      { status: 404 }
    );
  }

  if (body.action === "default") {
    await PaymentMethod.updateMany(
      { userId: user._id },
      { $set: { isDefault: false } }
    );

    method.isDefault = true;
    await method.save();

    return NextResponse.json({ success: true, method });
  }

  return NextResponse.json(
    { success: false, message: "عملية غير معروفة" },
    { status: 400 }
  );
}

export async function DELETE(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");

  const method = await PaymentMethod.findOneAndDelete({
    _id: id,
    userId: user._id,
  });

  if (!method) {
    return NextResponse.json(
      { success: false, message: "طريقة الدفع غير موجودة" },
      { status: 404 }
    );
  }

  if (method.isDefault) {
    await PaymentMethod.findOneAndUpdate(
      { userId: user._id },
      { $set: { isDefault: true } },
      { sort: { createdAt: 1 } }
    );
  }

  return NextResponse.json({
    success: true,
    message: "تم حذف طريقة الدفع",
  });
}