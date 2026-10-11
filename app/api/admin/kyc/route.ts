import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import KycRequest from "@/models/KycRequest";
import User from "@/models/User";

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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const sort = searchParams.get("sort") === "oldest" ? 1 : -1;

    const filter: Record<string, unknown> = {};

    if (["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const requests = await KycRequest.find(filter)
      .populate("userId", "_id name username email isVerified")
      .sort({ createdAt: sort })
      .limit(500)
      .lean();

    return NextResponse.json({
      success: true,
      requests: requests.map((item: any) => ({
        ...item,
        _id: String(item._id),
        userId: item.userId
          ? {
              ...item.userId,
              _id: String(item.userId._id),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("ADMIN KYC GET ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل طلبات التوثيق" },
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
    const action = String(body.action || "");
    const reason = String(body.reason || "").trim();

    if (!id || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "بيانات الطلب غير صحيحة" },
        { status: 400 }
      );
    }

    if (action === "reject" && !reason) {
      return NextResponse.json(
        { success: false, message: "سبب الرفض مطلوب" },
        { status: 400 }
      );
    }

    await connectDB();

    const kyc = await KycRequest.findById(id);

    if (!kyc) {
      return NextResponse.json(
        { success: false, message: "طلب التوثيق غير موجود" },
        { status: 404 }
      );
    }

    if (kyc.status !== "pending") {
      return NextResponse.json(
        { success: false, message: "تمت مراجعة هذا الطلب بالفعل" },
        { status: 400 }
      );
    }

    const sensitiveFiles = [
      kyc.documentPath,
      kyc.selfiePath,
    ].filter(Boolean);

    const sensitiveDirectory = sensitiveFiles.length
      ? require("path").dirname(require("path").resolve(/*turbopackIgnore: true*/ process.cwd(), sensitiveFiles[0]))
      : null;

    if (action === "approve") {
      kyc.status = "approved";
      kyc.rejectionReason = undefined;
    } else {
      kyc.status = "rejected";
      kyc.rejectionReason = reason;
    }

    kyc.reviewedBy = admin._id;
    kyc.reviewedAt = new Date();

    // حذف البيانات الحساسة من سجل KYC بعد انتهاء المراجعة.
    kyc.fullName = "";
    kyc.dateOfBirth = "";
    kyc.nationality = "";
    kyc.documentType = "passport";
    kyc.documentNumber = "";
    kyc.issuingCountry = "";
    kyc.issueDate = undefined;
    kyc.expiryDate = undefined;
    kyc.documentPath = "";
    kyc.selfiePath = "";

    await kyc.save();

    // حذف ملفات الهوية والسيلفي من التخزين الخاص.
    if (sensitiveDirectory) {
      const root = require("path").resolve(
        process.cwd(),
        "private",
        "kyc"
      );

      if (
        sensitiveDirectory === root ||
        sensitiveDirectory.startsWith(root + require("path").sep)
      ) {
        await require("fs").promises
          .rm(sensitiveDirectory, {
            recursive: true,
            force: true,
          })
          .catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      message:
        action === "approve"
          ? "تم اعتماد التوثيق وحذف بيانات الوثائق"
          : "تم رفض الطلب وحذف بيانات الوثائق",
    });
  } catch (error) {
    console.error("ADMIN KYC PATCH ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحديث طلب التوثيق" },
      { status: 500 }
    );
  }
}