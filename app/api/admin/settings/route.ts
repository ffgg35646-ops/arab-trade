import { NextRequest, NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/platform-settings";
import PlatformSettings from "@/models/PlatformSettings";
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

    const currentSettings = await getPlatformSettings();
    const numericFields: Record<string, string[]> = {
      deposits: ["minAmount", "maxAmount"],
      withdrawals: ["minAmount", "maxAmount", "dailyLimit"],
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

    const update: Record<string, unknown> = {};

    for (const section of allowedSections) {
      if (body?.[section] && typeof body[section] === "object") {
        for (const [key, value] of Object.entries(body[section])) {
          update[`${section}.${key}`] = value;
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