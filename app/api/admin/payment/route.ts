import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import PaymentOption from "@/models/PaymentOption";
import { normalizePaymentNetwork, USDT_ASSET } from "@/lib/unified-usdt-wallet";

function error(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return error("غير مصرح", 401);
    await connectDB();
    const rows = await PaymentOption.find({
      asset: USDT_ASSET,
      depositEnabled: { $ne: false },
      kind: { $ne: "withdrawal" },
    }).sort({ createdAt: -1 }).lean();
    const seen = new Set<string>();
    const methods = rows.flatMap((item: any) => {
      const network = normalizePaymentNetwork(item.network);
      if (!network) return [];
      const key = USDT_ASSET + ":" + network;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ...item, asset: USDT_ASSET, network, _id: String(item._id) }];
    });
    return NextResponse.json({ success: true, methods });
  } catch (errorValue) {
    console.error("ADMIN DEPOSIT METHODS GET ERROR:", errorValue);
    return error("تعذر تحميل وسائل الإيداع", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return error("غير مصرح", 401);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || body.asset || USDT_ASSET).trim();
    const asset = String(body.asset || "").trim().toUpperCase();
    const network = normalizePaymentNetwork(body.network);
    const address = String(body.address || "").trim();
    const minDeposit = Number(body.minDeposit ?? 0);
    const maxDeposit = Number(body.maxDeposit ?? 0);

    if (!name || asset !== USDT_ASSET || !network || !address) {
      return error("أكمل اسم وسيلة الإيداع وعملة USDT والشبكة والعنوان.");
    }
    if (!Number.isFinite(minDeposit) || minDeposit < 0 ||
        !Number.isFinite(maxDeposit) || maxDeposit < 0 ||
        (maxDeposit > 0 && minDeposit > maxDeposit)) {
      return error("حدود الإيداع غير صالحة.");
    }

    await connectDB();
    const candidates = await PaymentOption.find({ asset: USDT_ASSET }).sort({ createdAt: -1 });
    const existing = candidates.find((item: any) => normalizePaymentNetwork(item.network) === network);
    const values = {
      name, asset: USDT_ASSET, network, address, minDeposit, maxDeposit,
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      depositEnabled: true, kind: "deposit" as const, withdrawalEnabled: false,
    };
    const method = existing
      ? await PaymentOption.findByIdAndUpdate(existing._id, { $set: values }, { new: true, runValidators: true }).lean()
      : await PaymentOption.create({
          ...values, minWithdrawal: 0, maxWithdrawal: 0, withdrawalFee: 0, warning: "",
        });
    return NextResponse.json({ success: true, message: "تم حفظ وسيلة الإيداع.", method });
  } catch (errorValue) {
    console.error("ADMIN DEPOSIT METHODS POST ERROR:", errorValue);
    return error("تعذر حفظ وسيلة الإيداع", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return error("غير مصرح", 401);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) return error("المعرف مطلوب.");

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.asset !== undefined) {
      if (String(body.asset).trim().toUpperCase() !== USDT_ASSET) return error("عملة الإيداع المدعومة هي USDT.");
      update.asset = USDT_ASSET;
    }
    if (body.network !== undefined) {
      const network = normalizePaymentNetwork(body.network);
      if (!network) return error("اختر شبكة TRC20 أو BNB Smart Chain (BEP20).");
      update.network = network;
    }
    if (body.address !== undefined) {
      const address = String(body.address).trim();
      if (!address) return error("عنوان الإيداع مطلوب.");
      update.address = address;
    }
    for (const field of ["minDeposit", "maxDeposit"] as const) {
      if (body[field] === undefined) continue;
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0) return error("حدود الإيداع غير صالحة.");
      update[field] = value;
    }
    if (body.enabled !== undefined) update.enabled = Boolean(body.enabled);
    if (body.depositEnabled !== undefined) update.depositEnabled = Boolean(body.depositEnabled);
    update.kind = "deposit";
    update.withdrawalEnabled = false;

    if (update.minDeposit !== undefined && update.maxDeposit !== undefined &&
        Number(update.maxDeposit) > 0 && Number(update.minDeposit) > Number(update.maxDeposit)) {
      return error("الحد الأدنى للإيداع لا يمكن أن يتجاوز الحد الأقصى.");
    }

    await connectDB();
    const method = await PaymentOption.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
    if (!method) return error("وسيلة الإيداع غير موجودة.", 404);
    return NextResponse.json({ success: true, message: "تم تحديث وسيلة الإيداع.", method });
  } catch (errorValue) {
    console.error("ADMIN DEPOSIT METHODS PATCH ERROR:", errorValue);
    return error("تعذر تحديث وسيلة الإيداع", 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return error("غير مصرح", 401);
    const id = String(new URL(request.url).searchParams.get("id") || "").trim();
    if (!id) return error("المعرف مطلوب.");
    await connectDB();
    const deleted = await PaymentOption.findByIdAndDelete(id);
    if (!deleted) return error("وسيلة الإيداع غير موجودة.", 404);
    return NextResponse.json({ success: true, message: "تم حذف وسيلة الإيداع." });
  } catch (errorValue) {
    console.error("ADMIN DEPOSIT METHODS DELETE ERROR:", errorValue);
    return error("تعذر حذف وسيلة الإيداع", 500);
  }
}
