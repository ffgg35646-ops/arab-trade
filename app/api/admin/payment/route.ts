import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import PaymentOption from "@/models/PaymentOption";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    await connectDB();

    const methods = await PaymentOption.find({})
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      methods: methods.map((item: any) => ({
        ...item,
        _id: item._id ? String(item._id) : undefined,
      })),
    });
  } catch (error) {
    console.error("ADMIN PAYMENT GET ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل وسائل الدفع" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const asset = String(body.asset || "").trim().toUpperCase();
    const network = String(body.network || "").trim();
    const address = String(body.address || "").trim();
    const minDeposit = Number(body.minDeposit);
    const maxDeposit = Number(body.maxDeposit ?? 0);
    const minWithdrawal = Number(body.minWithdrawal);
    const maxWithdrawal = Number(body.maxWithdrawal ?? 0);
    const withdrawalFee = Number(body.withdrawalFee ?? 0);
    const warning = String(body.warning || "").trim();
    const enabled = body.enabled !== false;
    const depositEnabled = body.depositEnabled !== false;
    const withdrawalEnabled = body.withdrawalEnabled !== false;

    if (
      !name ||
      !asset ||
      !network ||
      !address ||
      !Number.isFinite(minDeposit) ||
      minDeposit < 0 ||
      !Number.isFinite(maxDeposit) || maxDeposit < 0 || (maxDeposit > 0 && minDeposit > maxDeposit) ||
      !Number.isFinite(minWithdrawal) ||
      minWithdrawal < 0 ||
      !Number.isFinite(maxWithdrawal) || maxWithdrawal < 0 || (maxWithdrawal > 0 && minWithdrawal > maxWithdrawal) ||
      !Number.isFinite(withdrawalFee) || withdrawalFee < 0
    ) {
      return NextResponse.json(
        { success: false, message: "بيانات وسيلة الدفع غير مكتملة" },
        { status: 400 }
      );
    }

    await connectDB();

    const exists = await PaymentOption.findOne({
      asset,
      network,
    });

    if (exists) {
      return NextResponse.json(
        { success: false, message: "هذه العملة والشبكة موجودتان بالفعل" },
        { status: 409 }
      );
    }

    const method = await PaymentOption.create({
      name,
      asset,
      network,
      address,
      minDeposit,
      maxDeposit,
      minWithdrawal,
      maxWithdrawal,
      withdrawalFee,
      warning,
      enabled,
      depositEnabled,
      withdrawalEnabled,
    });

    return NextResponse.json({
      success: true,
      message: "تمت إضافة وسيلة الدفع",
      method,
    });
  } catch (error) {
    console.error("ADMIN PAYMENT POST ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر إضافة وسيلة الدفع" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const id = String(body.id || "");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "المعرف مطلوب" },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};

    if (body.minDeposit !== undefined && body.maxDeposit !== undefined) {
      const minimum = Number(body.minDeposit);
      const maximum = Number(body.maxDeposit);
      if (!Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(maximum) || maximum < 0 || (maximum > 0 && minimum > maximum)) {
        return NextResponse.json({ success: false, message: "الحد الأدنى للإيداع لا يمكن أن يتجاوز الحد الأقصى" }, { status: 400 });
      }
    }
    if (body.minWithdrawal !== undefined && body.maxWithdrawal !== undefined) {
      const minimum = Number(body.minWithdrawal);
      const maximum = Number(body.maxWithdrawal);
      if (!Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(maximum) || maximum < 0 || (maximum > 0 && minimum > maximum)) {
        return NextResponse.json({ success: false, message: "الحد الأدنى للسحب لا يمكن أن يتجاوز الحد الأقصى" }, { status: 400 });
      }
    }

    if (body.name !== undefined) {
      update.name = String(body.name).trim();
    }

    if (body.asset !== undefined) {
      update.asset = String(body.asset).trim().toUpperCase();
    }

    if (body.network !== undefined) {
      update.network = String(body.network).trim();
    }

    if (body.address !== undefined) {
      update.address = String(body.address).trim();
    }

    if (body.minDeposit !== undefined) {
      const value = Number(body.minDeposit);

      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          { success: false, message: "حد الإيداع غير صالح" },
          { status: 400 }
        );
      }

      update.minDeposit = value;
    }

    if (body.minWithdrawal !== undefined) {
      const value = Number(body.minWithdrawal);

      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          { success: false, message: "حد السحب غير صالح" },
          { status: 400 }
        );
      }

      update.minWithdrawal = value;
    }

    for (const field of ["maxDeposit", "maxWithdrawal", "withdrawalFee"] as const) {
      if (body[field] === undefined) continue;
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json({ success: false, message: "الحد أو الرسوم غير صالحة" }, { status: 400 });
      }
      update[field] = value;
    }
    if (body.warning !== undefined) update.warning = String(body.warning || "").trim().slice(0, 1000);

    if (body.enabled !== undefined) {
      update.enabled = Boolean(body.enabled);
    }

    if (body.depositEnabled !== undefined) {
      update.depositEnabled = Boolean(body.depositEnabled);
    }

    if (body.withdrawalEnabled !== undefined) {
      update.withdrawalEnabled = Boolean(body.withdrawalEnabled);
    }

    await connectDB();

    const method = await PaymentOption.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!method) {
      return NextResponse.json(
        { success: false, message: "وسيلة الدفع غير موجودة" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث وسيلة الدفع",
      method,
    });
  } catch (error) {
    console.error("ADMIN PAYMENT PATCH ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحديث وسيلة الدفع" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "المعرف مطلوب" },
        { status: 400 }
      );
    }

    await connectDB();

    const deleted = await PaymentOption.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "وسيلة الدفع غير موجودة" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم حذف وسيلة الدفع",
    });
  } catch (error) {
    console.error("ADMIN PAYMENT DELETE ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر حذف وسيلة الدفع" },
      { status: 500 }
    );
  }
}