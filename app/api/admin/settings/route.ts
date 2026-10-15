import { NextRequest, NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/platform-settings";
import PlatformSettings from "@/models/PlatformSettings";
import InvestmentPackage from "@/models/InvestmentPackage";
import mongoose from "mongoose";
import { requireAdminLeader } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 403 }
      );
    }

    const settings = await getPlatformSettings();

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("ADMIN SETTINGS GET:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل إعدادات المنصة" },
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
        { status: 403 }
      );
    }

    const body = await request.json();

    const allowedSections = [
      "platform",
      "deposits",
      "withdrawals",
      "trading",
      "referral",
      "rewards",
      "notifications",
      "security",
    ];

    for (const field of ["firstPackageWithdrawalPercent", "referralPackageWithdrawalPercent"]) {
      if (body?.withdrawals && Object.prototype.hasOwnProperty.call(body.withdrawals, field)) {
        const value = Number(body.withdrawals[field]);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          return NextResponse.json(
            { success: false, message: "نسب سحب الباقات يجب أن تكون بين 0 و100" },
            { status: 400 }
          );
        }
      }
    }

    const packageMinima = body?.withdrawals?.withdrawalMinByPackage;
    if (packageMinima !== undefined) {
      if (!packageMinima || typeof packageMinima !== "object" || Array.isArray(packageMinima)) {
        return NextResponse.json({ success: false, message: "حدود السحب لكل باقة يجب أن تكون قائمة صحيحة" }, { status: 400 });
      }
      for (const [packageId, rawValue] of Object.entries(packageMinima)) {
        const value = Number(rawValue);
        if (!packageId || !Number.isFinite(value) || value < 0 || value > 1000000000000) {
          return NextResponse.json({ success: false, message: "الحد الأدنى للسحب لإحدى الباقات غير صالح" }, { status: 400 });
        }
      }
    }

    const currentSettings = await getPlatformSettings();

    // Withdrawal cards group duplicate catalog entries by visible package name.
    // Keep the configured minimum synchronized for every matching package ID,
    // including requests from an older admin page that submits only one changed ID.
    let synchronizedPackageMinima: Record<string, number> | undefined;
    if (packageMinima !== undefined) {
      synchronizedPackageMinima = Object.fromEntries(
        Object.entries(packageMinima).map(([id, value]) => [id, Number(value)])
      );
      const [catalogRows, configuredRaw] = await Promise.all([
        InvestmentPackage.find({}).select("_id name minimumWithdrawal").lean(),
        Promise.resolve(currentSettings.withdrawals.withdrawalMinByPackage as unknown as Record<string, number> | undefined),
      ]);
      const normalizePackageName = (value: unknown) =>
        String(value || "").normalize("NFKC").trim().replace(/\\s+/g, " ").toLocaleLowerCase("en-US");
      const groupedRows = new Map<string, any[]>();
      for (const row of catalogRows as any[]) {
        const nameKey = normalizePackageName(row.name);
        if (!nameKey) continue;
        const list = groupedRows.get(nameKey) || [];
        list.push(row);
        groupedRows.set(nameKey, list);
      }

      for (const rows of groupedRows.values()) {
        if (rows.length < 2) continue;
        const submittedRows = rows.filter((row) =>
          Object.prototype.hasOwnProperty.call(packageMinima, String(row._id))
        );
        if (!submittedRows.length) continue;

        const submittedValues = [...new Set(submittedRows.map((row) => Number(packageMinima[String(row._id)])))];
        let chosenValue = submittedValues[0];
        if (submittedValues.length > 1) {
          const changedRows = submittedRows.filter((row) => {
            const id = String(row._id);
            const previous = Number(configuredRaw?.[id] ?? row.minimumWithdrawal ?? currentSettings.withdrawals.minAmount ?? 0);
            return Math.abs(Number(packageMinima[id]) - previous) > 1e-8;
          });
          const changedValues = [...new Set(changedRows.map((row) => Number(packageMinima[String(row._id)])))];
          if (changedValues.length === 1) chosenValue = changedValues[0];
          else if (changedValues.length > 1) chosenValue = changedValues[changedValues.length - 1];
        }

        for (const row of rows) {
          synchronizedPackageMinima[String(row._id)] = chosenValue;
        }
      }
    }
    const numericFields: Record<string, string[]> = {
      deposits: ["minAmount", "maxAmount"],
      withdrawals: ["minAmount", "minGeneralWithdrawal", "maxAmount", "dailyLimit"],
    };
    for (const [section, fields] of Object.entries(numericFields)) {
      const values = body?.[section];
      if (!values || typeof values !== "object") continue;
      for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(values, field)) continue;
        const value = Number(values[field]);
        if (!Number.isFinite(value) || value < 0 || value > 1000000000000) {
          return NextResponse.json(
            { success: false, message: "حدود الإيداع والسحب يجب أن تكون أرقامًا صحيحة لا تقل عن صفر" },
            { status: 400 }
          );
        }
      }
    }

    const nextDepositMin = Number(body?.deposits?.minAmount ?? currentSettings.deposits.minAmount);
    const nextDepositMax = Number(body?.deposits?.maxAmount ?? currentSettings.deposits.maxAmount);
    const nextWithdrawalMin = Number(body?.withdrawals?.minAmount ?? currentSettings.withdrawals.minAmount);
    const nextWithdrawalMax = Number(body?.withdrawals?.maxAmount ?? currentSettings.withdrawals.maxAmount);
    if (nextDepositMax > 0 && nextDepositMin > nextDepositMax) {
      return NextResponse.json({ success: false, message: "الحد الأدنى للإيداع لا يمكن أن يتجاوز الحد الأقصى" }, { status: 400 });
    }
    if (nextWithdrawalMax > 0 && nextWithdrawalMin > nextWithdrawalMax) {
      return NextResponse.json({ success: false, message: "الحد الأدنى للسحب لا يمكن أن يتجاوز الحد الأقصى" }, { status: 400 });
    }

    const nextGeneralWithdrawalMin = Number(body?.withdrawals?.minGeneralWithdrawal ?? currentSettings.withdrawals.minGeneralWithdrawal ?? nextWithdrawalMin);
    if (nextWithdrawalMax > 0 && nextGeneralWithdrawalMin > nextWithdrawalMax) {
      return NextResponse.json({ success: false, message: "الحد الأدنى للسحب العام لا يمكن أن يتجاوز الحد الأقصى للسحب" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    for (const section of allowedSections) {
      if (body?.[section] && typeof body[section] === "object") {
        for (const [key, value] of Object.entries(body[section])) {
          const effectiveValue = section === "withdrawals" && key === "withdrawalMinByPackage" && synchronizedPackageMinima
            ? synchronizedPackageMinima
            : value;
          update[`${section}.${key}`] = effectiveValue;
        }
      }
    }

    if (!Object.keys(update).length) {
      return NextResponse.json(
        { success: false, message: "لا توجد إعدادات للتحديث" },
        { status: 400 }
      );
    }

    await PlatformSettings.updateOne(
      { key: "global" },
      { $set: update },
      { upsert: true }
    );

    // Keep the package document and the legacy settings map synchronized:
    // both the admin package editor and all withdrawal flows then read the same minimum.
    if (synchronizedPackageMinima !== undefined) {
      const writes = Object.entries(synchronizedPackageMinima)
        .filter(([packageId]) => mongoose.Types.ObjectId.isValid(packageId))
        .map(([packageId, rawValue]) => InvestmentPackage.updateOne(
          { _id: packageId },
          { $set: { minimumWithdrawal: Number(rawValue) } }
        ));
      await Promise.all(writes);
    }

    const settings = await getPlatformSettings();

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("ADMIN SETTINGS PATCH:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحديث إعدادات المنصة" },
      { status: 500 }
    );
  }
}