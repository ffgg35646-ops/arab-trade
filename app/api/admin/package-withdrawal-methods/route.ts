import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import PackageWithdrawalMethod from "@/models/PackageWithdrawalMethod";
import { normalizePaymentNetwork, USDT_ASSET } from "@/lib/unified-usdt-wallet";

function readMethodBody(body: any) {
  const name = String(body.name || body.asset || USDT_ASSET).trim();
  const asset = String(body.asset || USDT_ASSET).trim().toUpperCase();
  const network = normalizePaymentNetwork(body.network);
  const minWithdrawal = Number(body.minWithdrawal ?? 0);
  const maxWithdrawal = Number(body.maxWithdrawal ?? 0);
  const withdrawalFee = Number(body.withdrawalFee ?? 0);
  const warning = String(body.warning || "").trim().slice(0, 1000);

  if (!name || asset !== USDT_ASSET || !network) {
    throw new Error("أكمل اسم الوسيلة وشبكة USDT لسحب الباقات.");
  }
  for (const value of [minWithdrawal, maxWithdrawal, withdrawalFee]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("الحدود والرسوم يجب أن تكون أرقامًا صحيحة لا تقل عن صفر.");
    }
  }
  if (maxWithdrawal > 0 && minWithdrawal > maxWithdrawal) {
    throw new Error("الحد الأدنى لسحب الباقات لا يمكن أن يتجاوز الحد الأقصى.");
  }
  return {
    name,
    asset: USDT_ASSET,
    network,
    minWithdrawal,
    maxWithdrawal,
    withdrawalFee,
    warning,
    enabled: body.enabled === undefined ? true : Boolean(body.enabled),
    withdrawalEnabled: body.withdrawalEnabled === undefined ? true : Boolean(body.withdrawalEnabled),
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    await connectDB();
    const methods = await PackageWithdrawalMethod.find({ asset: USDT_ASSET }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({
      success: true,
      methods: methods.map((method: any) => ({
        ...method,
        _id: String(method._id),
        asset: USDT_ASSET,
        network: normalizePaymentNetwork(method.network),
      })),
    });
  } catch (error) {
    console.error("ADMIN PACKAGE WITHDRAWAL METHODS GET:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل وسائل سحب الباقات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    const body = await request.json();
    let values;
    try {
      values = readMethodBody(body);
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "بيانات الوسيلة غير صحيحة" }, { status: 400 });
    }

    await connectDB();
    const method = await PackageWithdrawalMethod.findOneAndUpdate(
      { asset: values.asset, network: values.network },
      { $set: values },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    ).lean();

    return NextResponse.json({
      success: true,
      message: "تم حفظ وسيلة سحب الباقات فقط.",
      method: method ? { ...method, _id: String((method as any)._id), network: normalizePaymentNetwork((method as any).network) } : null,
    });
  } catch (error) {
    console.error("ADMIN PACKAGE WITHDRAWAL METHODS POST:", error);
    return NextResponse.json({ success: false, message: "تعذر حفظ وسيلة سحب الباقات" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ success: false, message: "معرف وسيلة سحب الباقات مطلوب" }, { status: 400 });

    let values;
    try {
      values = readMethodBody(body);
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "بيانات الوسيلة غير صحيحة" }, { status: 400 });
    }

    await connectDB();
    const method = await PackageWithdrawalMethod.findByIdAndUpdate(
      id,
      { $set: values },
      { new: true, runValidators: true },
    ).lean();

    if (!method) return NextResponse.json({ success: false, message: "وسيلة سحب الباقات غير موجودة" }, { status: 404 });
    return NextResponse.json({
      success: true,
      message: "تم تحديث وسيلة سحب الباقات فقط.",
      method: { ...method, _id: String((method as any)._id), network: normalizePaymentNetwork((method as any).network) },
    });
  } catch (error) {
    console.error("ADMIN PACKAGE WITHDRAWAL METHODS PATCH:", error);
    return NextResponse.json({ success: false, message: "تعذر تحديث وسيلة سحب الباقات" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    await connectDB();
    const id = String(new URL(request.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ success: false, message: "معرف الوسيلة مطلوب" }, { status: 400 });

    const deleted = await PackageWithdrawalMethod.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ success: false, message: "وسيلة سحب الباقات غير موجودة" }, { status: 404 });

    return NextResponse.json({ success: true, message: "تم حذف وسيلة سحب الباقات فقط." });
  } catch (error) {
    console.error("ADMIN PACKAGE WITHDRAWAL METHODS DELETE:", error);
    return NextResponse.json({ success: false, message: "تعذر حذف وسيلة سحب الباقات" }, { status: 500 });
  }
}
