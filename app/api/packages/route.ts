import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import DepositBalance from "@/models/DepositBalance";
import InvestmentPackage from "@/models/InvestmentPackage";
import UserPackage from "@/models/UserPackage";
import PackageLedger from "@/models/PackageLedger";
import { adjustWallet } from "@/lib/settlement";

const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });

    await connectDB();
    const [packages, depositBalances, userPackages] = await Promise.all([
      InvestmentPackage.find({ enabled: true }).sort({ sortOrder: 1, price: 1 }).lean(),
      DepositBalance.find({ userId: user._id }).sort({ asset: 1 }).lean(),
      UserPackage.find({ userId: user._id }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    return NextResponse.json({
      success: true,
      packages,
      depositBalances,
      userPackages,
      policy: {
        dailyReturnsAutomatic: false,
        earningsNotice: "يضاف إلى رصيد الباقة العائد المحقق فعليًا والمسجل في النظام فقط. لا يتم إنشاء أرباح يومية مضمونة تلقائيًا.",
        cancellationNotice: "عند إلغاء باقة نشطة، يضاف 50% من قيمة تفعيلها إلى رصيد السحب العام، وتظل الأرباح المحققة المتاحة مسجلة في الباقة.",
      },
    });
  } catch (error) {
    console.error("PACKAGES GET:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل الباقات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });

    await connectDB();
    const body = await request.json();
    const action = String(body.action || "");
    const packageId = String(body.packageId || "").trim();
    const userPackageId = String(body.userPackageId || "").trim();

    if (action === "activate") {
      if (!mongoose.Types.ObjectId.isValid(packageId)) {
        return NextResponse.json({ success: false, message: "الباقة غير صحيحة" }, { status: 400 });
      }

      const plan = await InvestmentPackage.findOne({ _id: packageId, enabled: true }).lean();
      if (!plan) return NextResponse.json({ success: false, message: "الباقة غير موجودة أو متوقفة" }, { status: 404 });

      const activePackage = await UserPackage.findOne({ userId: user._id, status: "active" }).lean();
      if (activePackage) {
        return NextResponse.json({
          success: false,
          message: "لديك باقة نشطة بالفعل. ألغِها أولًا؛ سيُحوّل نصف قيمة تفعيلها إلى رصيد السحب العام.",
        }, { status: 409 });
      }

      const price = Number(plan.price);
      const asset = String(plan.asset || "USDT").toUpperCase();
      const depositBalance = await DepositBalance.findOneAndUpdate(
        { userId: user._id, asset, available: { $gte: price } },
        { $inc: { available: -price } },
        { new: true }
      );

      if (!depositBalance) {
        return NextResponse.json({
          success: false,
          message: "رصيد الإيداع غير كافٍ. تحتاج إلى " + price + " " + asset + " في خانة رصيد الإيداع لتفعيل هذه الباقة.",
        }, { status: 400 });
      }

      let purchased;
      try {
        purchased = await UserPackage.create({
          userId: user._id,
          packageId: plan._id,
          packageName: plan.name,
          investedAmount: price,
          asset,
          durationDays: Number(plan.durationDays),
          status: "active",
          availableEarnings: 0,
          lockedEarnings: 0,
          totalRealizedEarnings: 0,
          totalWithdrawn: 0,
          cancellationRefund: 0,
          activatedAt: new Date(),
        });
        await PackageLedger.create({
          userId: user._id,
          userPackageId: purchased._id,
          type: "activation",
          asset,
          amount: -price,
          note: "تفعيل باقة " + plan.name + " من رصيد الإيداع",
        });
      } catch (createError) {
        if (purchased?._id) {
          await UserPackage.deleteOne({ _id: purchased._id });
        }
        await DepositBalance.updateOne({ _id: depositBalance._id }, { $inc: { available: price } });
        throw createError;
      }

      return NextResponse.json({
        success: true,
        message: "تم تفعيل الباقة من رصيد الإيداع.",
        userPackage: purchased,
      }, { status: 201 });
    }

    if (action === "cancel") {
      if (!mongoose.Types.ObjectId.isValid(userPackageId)) {
        return NextResponse.json({ success: false, message: "معرف الباقة غير صحيح" }, { status: 400 });
      }

      const current = await UserPackage.findOne({
        _id: userPackageId,
        userId: user._id,
        status: "active",
      });

      if (!current) {
        return NextResponse.json({ success: false, message: "لا توجد باقة نشطة بهذا المعرف" }, { status: 404 });
      }

      if (Number(current.lockedEarnings || 0) > 0) {
        return NextResponse.json({
          success: false,
          message: "لا يمكن إلغاء الباقة بينما يوجد طلب سحب من أرباحها قيد المراجعة.",
        }, { status: 409 });
      }

      const refund = roundAmount(Number(current.investedAmount || 0) * 0.5);
      try {
        const cancelled = await UserPackage.findOneAndUpdate(
          { _id: current._id, userId: user._id, status: "active", lockedEarnings: 0 },
          { $set: { status: "cancelled", cancelledAt: new Date(), cancellationRefund: refund } },
          { new: true }
        );

        if (!cancelled) {
          return NextResponse.json(
            { success: false, message: "تم تغيير حالة الباقة بالفعل. حدّث الصفحة قبل المحاولة مرة أخرى." },
            { status: 409 }
          );
        }

        if (refund > 0) {
          await adjustWallet(
            user._id,
            cancelled.asset,
            refund,
            0,
            "adjustment",
            "package-cancel:" + String(cancelled._id),
            "استرداد 50% من قيمة باقة " + cancelled.packageName + " الملغاة"
          );
        }

        await PackageLedger.create({
          userId: user._id,
          userPackageId: cancelled._id,
          type: "cancellation_refund",
          asset: cancelled.asset,
          amount: refund,
          note: "تم إلغاء الباقة وإضافة نصف قيمة تفعيلها إلى رصيد السحب العام",
        });
      } catch (cancelError) {
        console.error("PACKAGE CANCEL:", cancelError);
        return NextResponse.json({
          success: false,
          message: "تعذر إتمام إلغاء الباقة بصورة مؤكدة. راجع سجل العمليات قبل إعادة المحاولة.",
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "تم إلغاء الباقة وإضافة " + refund + " " + current.asset + " إلى رصيد السحب العام. تبقى الأرباح المحققة المتاحة في رصيد هذه الباقة.",
      });
    }

    return NextResponse.json({ success: false, message: "الإجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("PACKAGES POST:", error);
    return NextResponse.json({ success: false, message: "تعذر تنفيذ عملية الباقة" }, { status: 500 });
  }
}
