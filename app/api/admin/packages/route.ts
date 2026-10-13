import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import InvestmentPackage from "@/models/InvestmentPackage";
import PlatformSettings from "@/models/PlatformSettings";
import UserPackage from "@/models/UserPackage";
import Wallet from "@/models/Wallet";
import PackageLedger from "@/models/PackageLedger";
import { ensureDefaultInvestmentPackages } from "@/lib/ensure-default-investment-packages";
import { accrueDuePackageEarnings } from "@/lib/accrue-package-earnings";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });

    await connectDB();
    await ensureDefaultInvestmentPackages();
    await accrueDuePackageEarnings();
    const [rawPackages, userPackages, spotWallets, packageLedger, savedSettings] = await Promise.all([
      InvestmentPackage.find({}).sort({ sortOrder: 1, price: 1 }).lean(),
      UserPackage.find({})
        .populate("userId", "name username email")
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      Wallet.find({ type: "spot", mode: "live" })
        .populate("userId", "name username email")
        .sort({ updatedAt: -1 })
        .limit(1000)
        .lean(),
      PackageLedger.find({})
        .populate("userId", "name username email")
        .populate("userPackageId", "packageName")
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      PlatformSettings.findOne({ key: "global" }).select("withdrawals.withdrawalMinByPackage").lean(),
    ]);
    const savedMinimums = (savedSettings as any)?.withdrawals?.withdrawalMinByPackage || {};
    const packages = (rawPackages as any[]).map((plan) => ({
      ...plan,
      minimumWithdrawal: Number(savedMinimums[String(plan._id)] ?? plan.minimumWithdrawal ?? 100),
    }));

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
      depositBalances: spotWallets.flatMap((wallet: any) => {
        const balances = (wallet.balances || []).filter(
          (item: any) => String(item.asset || "").trim().toUpperCase() === "USDT" &&
            (Number(item.available || 0) > 0 || Number(item.locked || 0) > 0),
        );
        return balances.map((item: any, index: number) => ({
          _id: String(wallet._id) + ":USDT:" + index,
          asset: "USDT",
          available: Number(item.available || 0),
          locked: Number(item.locked || 0),
          userId: wallet.userId ? {
            _id: String(wallet.userId._id),
            name: wallet.userId.name,
            username: wallet.userId.username,
            email: wallet.userId.email,
          } : null,
        }));
      }),
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
    const durationDays = 0;
    const dailyProfit = Number(body.dailyProfit ?? 0);
    const minimumWithdrawal = Number(body.minimumWithdrawal ?? 100);
    const sortOrder = Number(body.sortOrder || 0);
    const enabled = body.enabled !== false;

    if (!name || !Number.isFinite(price) || price < 1 ||
        !Number.isFinite(dailyProfit) || dailyProfit < 0 || dailyProfit > 1000000000 ||
        !Number.isFinite(minimumWithdrawal) || minimumWithdrawal < 0 ||
        !Number.isFinite(sortOrder)) {
      return NextResponse.json({ success: false, message: "تحقق من الاسم والسعر والمدة والترتيب" }, { status: 400 });
    }

    const item = await InvestmentPackage.create({
      name, description, price, asset: "USDT", durationDays, dailyProfit, minimumWithdrawal, sortOrder, enabled,
    });
    await PlatformSettings.updateOne(
      { key: "global" },
      { $set: { key: "global", [`withdrawals.withdrawalMinByPackage.${String(item._id)}`]: minimumWithdrawal } },
      { upsert: true }
    );

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
    // All packages are lifetime packages; legacy duration values are ignored.
    update.durationDays = 0;
    if (body.dailyProfit !== undefined) {
      const value = Number(body.dailyProfit);
      if (!Number.isFinite(value) || value < 0 || value > 1000000000) return NextResponse.json({ success: false, message: "الربح اليومي غير صالح" }, { status: 400 });
      update.dailyProfit = value;
    }
    if (body.sortOrder !== undefined) {
      const value = Number(body.sortOrder);
      if (!Number.isFinite(value)) return NextResponse.json({ success: false, message: "ترتيب الباقة غير صالح" }, { status: 400 });
      update.sortOrder = value;
    }
    if (body.minimumWithdrawal !== undefined) {
      const value = Number(body.minimumWithdrawal);
      if (!Number.isFinite(value) || value < 0) return NextResponse.json({ success: false, message: "الحد الأدنى لسحب هذه الباقة غير صالح" }, { status: 400 });
      update.minimumWithdrawal = value;
    }
    if (body.enabled !== undefined) update.enabled = body.enabled === true;

    // Settle elapsed days using the old rate before the admin changes it.
    if (body.dailyProfit !== undefined) await accrueDuePackageEarnings();

    const previousPlan = await InvestmentPackage.findById(id).select("dailyProfit").lean();
    if (!previousPlan) return NextResponse.json({ success: false, message: "الباقة غير موجودة" }, { status: 404 });
    const profitRateChanged = body.dailyProfit !== undefined &&
      Number(previousPlan.dailyProfit || 0) !== Number(body.dailyProfit);

    const item = await InvestmentPackage.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!item) return NextResponse.json({ success: false, message: "الباقة غير موجودة" }, { status: 404 });
    if (update.minimumWithdrawal !== undefined) {
      await PlatformSettings.updateOne(
        { key: "global" },
        { $set: { key: "global", [`withdrawals.withdrawalMinByPackage.${id}`]: Number(update.minimumWithdrawal) } },
        { upsert: true }
      );
    }
    if (profitRateChanged) {
      // Apply the new rate only to future 24-hour windows; preserve elapsed profit.
      await UserPackage.updateMany({ packageId: id, status: "active" }, { $set: { lastProfitAt: new Date() } });
    }
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
