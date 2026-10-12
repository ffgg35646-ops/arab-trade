import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import InvestmentPackage from "@/models/InvestmentPackage";
import UserPackage from "@/models/UserPackage";
import DepositBalance from "@/models/DepositBalance";
import PackageLedger from "@/models/PackageLedger";
import { ensureDefaultInvestmentPackages } from "@/lib/ensure-default-investment-packages";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    await connectDB();
    await ensureDefaultInvestmentPackages();
    const [packages, userPackages, depositBalances, packageLedger] = await Promise.all([
      InvestmentPackage.find({}).sort({ sortOrder: 1, price: 1 }).lean(),
      UserPackage.find({})
        .populate("userId", "name username email")
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      DepositBalance.find({ available: { $gt: 0 } })
        .populate("userId", "name username email")
        .sort({ asset: 1, available: -1 })
        .limit(500)
        .lean(),
      PackageLedger.find({})
        .populate("userId", "name username email")
        .populate("userPackageId", "packageName")
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      packages,
      userPackages: userPackages.map((row: any) => ({
        ...row,
        _id: String(row._id),
        userId: row.userId ? {
          _id: String(row.userId._id),
          name: row.userId.name,
          username: row.userId.username,
          email: row.userId.email,
        } : null,
      })),
      depositBalances: depositBalances.map((row: any) => ({
        ...row,
        _id: String(row._id),
        userId: row.userId ? {
          _id: String(row.userId._id),
          name: row.userId.name,
          username: row.userId.username,
          email: row.userId.email,
        } : null,
      })),
      packageLedger: packageLedger.map((row: any) => ({
        ...row,
        _id: String(row._id),
        userId: row.userId ? {
          _id: String(row.userId._id),
          name: row.userId.name,
          username: row.userId.username,
          email: row.userId.email,
        } : null,
        userPackageId: row.userPackageId ? {
          _id: String(row.userPackageId._id),
          packageName: row.userPackageId.packageName,
        } : null,
      })),
    });
  } catch (error) {
    console.error("ADMIN PACKAGES GET:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل الباقات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    await connectDB();
    const body = await request.json();
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const price = Number(body.price);
    const durationDays = Number(body.durationDays);
    const sortOrder = Number(body.sortOrder || 0);
    const enabled = body.enabled !== false;

    if (!name || !Number.isFinite(price) || price < 1 ||
        !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650 ||
        !Number.isFinite(sortOrder)) {
      return NextResponse.json({ success: false, message: "تحقق من الاسم والسعر والمدة والترتيب" }, { status: 400 });
    }

    const item = await InvestmentPackage.create({
      name, description, price, asset: "USDT", durationDays, sortOrder, enabled,
    });

    return NextResponse.json({ success: true, package: item }, { status: 201 });
  } catch (error) {
    console.error("ADMIN PACKAGES POST:", error);
    return NextResponse.json({ success: false, message: "تعذر إنشاء الباقة" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    await connectDB();
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "معرف الباقة غير صحيح" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.description !== undefined) update.description = String(body.description).trim();
    if (body.price !== undefined) {
      const value = Number(body.price);
      if (!Number.isFinite(value) || value < 1) return NextResponse.json({ success: false, message: "سعر الباقة غير صالح" }, { status: 400 });
      update.price = value;
    }
    if (body.durationDays !== undefined) {
      const value = Number(body.durationDays);
      if (!Number.isInteger(value) || value < 1 || value > 3650) return NextResponse.json({ success: false, message: "مدة الباقة غير صالحة" }, { status: 400 });
      update.durationDays = value;
    }
    if (body.sortOrder !== undefined) {
      const value = Number(body.sortOrder);
      if (!Number.isFinite(value)) return NextResponse.json({ success: false, message: "ترتيب الباقة غير صالح" }, { status: 400 });
      update.sortOrder = value;
    }
    if (body.enabled !== undefined) update.enabled = body.enabled === true;

    const item = await InvestmentPackage.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!item) return NextResponse.json({ success: false, message: "الباقة غير موجودة" }, { status: 404 });
    return NextResponse.json({ success: true, package: item });
  } catch (error) {
    console.error("ADMIN PACKAGES PATCH:", error);
    return NextResponse.json({ success: false, message: "تعذر تحديث الباقة" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    await connectDB();
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "معرف الباقة غير صحيح" }, { status: 400 });

    const hasAccounts = await UserPackage.exists({ packageId: id });
    if (hasAccounts) {
      const item = await InvestmentPackage.findByIdAndUpdate(id, { $set: { enabled: false } }, { new: true });
      return NextResponse.json({ success: true, archived: true, package: item, message: "للباقة حسابات مرتبطة؛ تم إيقافها بدل حذف سجلها." });
    }

    await InvestmentPackage.findByIdAndDelete(id);
    return NextResponse.json({ success: true, archived: false, message: "تم حذف الباقة." });
  } catch (error) {
    console.error("ADMIN PACKAGES DELETE:", error);
    return NextResponse.json({ success: false, message: "تعذر حذف الباقة" }, { status: 500 });
  }
}
