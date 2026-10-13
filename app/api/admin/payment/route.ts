import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import PaymentOption from "@/models/PaymentOption";
import { normalizePaymentNetwork, USDT_ASSET } from "@/lib/unified-usdt-wallet";

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

    const savedMethods = await PaymentOption.find({})
      .sort({ createdAt: -1 })
      .lean();
    const seen = new Set<string>();
    const methods = savedMethods.flatMap((item: any) => {
      const asset = String(item.asset || "").trim().toUpperCase();
      const network = normalizePaymentNetwork(item.network);
      if (asset !== USDT_ASSET || !network) return [];
      const key = asset + ":" + network;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        ...item,
        asset: USDT_ASSET,
        network,
        _id: item._id ? String(item._id) : undefined,
      }];
    });

    return NextResponse.json({ success: true, methods });
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
    const kind = body.kind === "withdrawal" ? "withdrawal" : "deposit";
    const name = String(body.name || body.asset || USDT_ASSET).trim();
    const requestedAsset = String(body.asset || "").trim().toUpperCase();
    const asset = USDT_ASSET;
    const network = normalizePaymentNetwork(body.network);
    const address = String(body.address || "").trim();
    const minDeposit = Number(body.minDeposit ?? 0);
    const minWithdrawal = Number(body.minWithdrawal ?? 0);

    if (requestedAsset !== USDT_ASSET) {
      return NextResponse.json({ success: false, message: "عملة الإيداع والسحب الوحيدة المدعومة هي USDT." }, { status: 400 });
    }
    if (!network) {
      return NextResponse.json({ success: false, message: "اختر شبكة TRC20 أو BNB Smart Chain (BEP20)." }, { status: 400 });
    }

    if (
      !name || !asset || !network ||
      (kind === "deposit" && !address) ||
      !Number.isFinite(kind === "deposit" ? minDeposit : minWithdrawal) ||
      (kind === "deposit" ? minDeposit : minWithdrawal) < 0
    ) {
      return NextResponse.json(
        { success: false, message: "أكمل بيانات العملة والشبكة والحد الأدنى" },
        { status: 400 }
      );
    }

    await connectDB();

    // Keep the existing unique asset/network key and merge the selected
    // operation into an existing record instead of creating a conflicting row.
    const existingCandidates = await PaymentOption.find({ asset }).sort({ createdAt: -1 });
    const existing = existingCandidates.find(
      (item: any) => normalizePaymentNetwork(item.network) === network,
    );
    if (existing) {
      const oldKind = String((existing as any).kind || "both");
      const mergedKind = oldKind === "both" || oldKind === kind ? oldKind : "both";
      const update: Record<string, unknown> = {
        name,
        asset: USDT_ASSET,
        network,
        enabled: true,
        kind: mergedKind,
      };
      if (kind === "deposit") {
        update.address = address;
        update.minDeposit = minDeposit;
        update.depositEnabled = true;
      } else {
        update.minWithdrawal = minWithdrawal;
        update.withdrawalEnabled = true;
      }
      const method = await PaymentOption.findByIdAndUpdate(
        existing._id,
        { $set: update },
        { new: true, runValidators: true }
      ).lean();
      return NextResponse.json({
        success: true,
        message: kind === "deposit" ? "تمت إضافة/تحديث وسيلة الإيداع" : "تمت إضافة/تحديث وسيلة السحب",
        method,
      });
    }

    const method = await PaymentOption.create({
      name,
      asset,
      network,
      kind,
      address: kind === "deposit" ? address : "",
      minDeposit: kind === "deposit" ? minDeposit : 0,
      maxDeposit: 0,
      minWithdrawal: kind === "withdrawal" ? minWithdrawal : 0,
      maxWithdrawal: 0,
      withdrawalFee: 0,
      warning: "",
      enabled: true,
      depositEnabled: kind === "deposit",
      withdrawalEnabled: kind === "withdrawal",
    });

    return NextResponse.json({
      success: true,
      message: kind === "deposit" ? "تمت إضافة وسيلة الإيداع" : "تمت إضافة وسيلة السحب",
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
      const requestedAsset = String(body.asset).trim().toUpperCase();
      if (requestedAsset !== USDT_ASSET) {
        return NextResponse.json({ success: false, message: "عملة الإيداع والسحب الوحيدة المدعومة هي USDT." }, { status: 400 });
      }
      update.asset = USDT_ASSET;
    }

    if (body.network !== undefined) {
      const network = normalizePaymentNetwork(body.network);
      if (!network) {
        return NextResponse.json({ success: false, message: "اختر شبكة TRC20 أو BNB Smart Chain (BEP20)." }, { status: 400 });
      }
      update.network = network;
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