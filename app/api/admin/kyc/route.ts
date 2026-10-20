import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import KycRequest from "@/models/KycRequest";
import User from "@/models/User";
import path from "node:path";
import fs from "node:fs/promises";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) {
      return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });
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
      .select("-identityFrontData -identityBackData -selfieData")
      .populate("userId", "_id name username email isVerified isActive approvalStatus rejectionReason createdAt")
      .sort({ createdAt: sort })
      .limit(500)
      .lean();

    return NextResponse.json({
      success: true,
      requests: requests.map((item: any) => ({
        ...item,
        _id: String(item._id),
        userId: item.userId
          ? { ...item.userId, _id: String(item.userId._id) }
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
  let accountForRollback: any = null;
  let oldAccountState: { isActive: boolean; approvalStatus: string; rejectionReason?: string } | null = null;

  try {
    const admin = await requireAdminLeader(request);
    if (!admin) {
      return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const id = String(body.id || "");
    const action = String(body.action || "");
    const reason = String(body.reason || "").trim();

    if (!id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ success: false, message: "بيانات الطلب غير صحيحة" }, { status: 400 });
    }
    if (action === "reject" && !reason) {
      return NextResponse.json({ success: false, message: "سبب الرفض مطلوب" }, { status: 400 });
    }
    if (action === "reject" && reason.length > 500) {
      return NextResponse.json({ success: false, message: "سبب الرفض يجب ألا يتجاوز 500 حرف" }, { status: 400 });
    }

    await connectDB();
    const kyc = await KycRequest.findById(id).select("+identityFrontData +identityBackData +selfieData");
    if (!kyc) {
      return NextResponse.json({ success: false, message: "طلب التوثيق غير موجود" }, { status: 404 });
    }
    if (kyc.status !== "pending") {
      return NextResponse.json({ success: false, message: "تمت مراجعة هذا الطلب بالفعل" }, { status: 400 });
    }

    const applicant = await User.findById(kyc.userId);
    const isSignupAwaitingApproval = applicant?.approvalStatus === "pending";

    if (isSignupAwaitingApproval && applicant) {
      accountForRollback = applicant;
      oldAccountState = {
        isActive: applicant.isActive,
        approvalStatus: applicant.approvalStatus,
        rejectionReason: applicant.rejectionReason,
      };

      if (action === "approve") {
        applicant.approvalStatus = "approved";
        applicant.isActive = true;
        applicant.rejectionReason = undefined;
      } else {
        applicant.approvalStatus = "rejected";
        applicant.isActive = false;
        applicant.rejectionReason = reason;
      }
      await applicant.save();
    }

    const sensitiveFiles = [kyc.documentPath, kyc.selfiePath].filter(
      (file): file is string => typeof file === "string" && file.startsWith("private/kyc/")
    );
    const sensitiveDirectory = sensitiveFiles.length
      ? path.dirname(path.resolve(process.cwd(), sensitiveFiles[0]))
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

    // Delete identity data from MongoDB after the reviewer decides.
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
    kyc.identityFrontData = undefined;
    kyc.identityBackData = undefined;
    kyc.selfieData = undefined;
    kyc.identityFrontMime = undefined;
    kyc.identityBackMime = undefined;
    kyc.selfieMime = undefined;

    try {
      await kyc.save();
    } catch (error) {
      if (accountForRollback && oldAccountState) {
        accountForRollback.isActive = oldAccountState.isActive;
        accountForRollback.approvalStatus = oldAccountState.approvalStatus;
        accountForRollback.rejectionReason = oldAccountState.rejectionReason;
        await accountForRollback.save().catch(() => {});
      }
      throw error;
    }

    // Remove legacy local-filesystem uploads if this request predates MongoDB storage.
    if (sensitiveDirectory) {
      const root = path.resolve(process.cwd(), "private", "kyc");
      if (sensitiveDirectory.startsWith(root + path.sep)) {
        await fs.rm(sensitiveDirectory, { recursive: true, force: true }).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      message: action === "approve"
        ? (isSignupAwaitingApproval ? "تم قبول التسجيل وتفعيل الحساب." : "تم اعتماد التوثيق وحذف بيانات الوثائق.")
        : (isSignupAwaitingApproval ? "تم رفض التسجيل وحفظ سبب الرفض." : "تم رفض الطلب وحذف بيانات الوثائق."),
    });
  } catch (error) {
    console.error("ADMIN KYC PATCH ERROR:", error);
    return NextResponse.json(
      { success: false, message: "تعذر تحديث طلب المراجعة" },
      { status: 500 }
    );
  }
}
