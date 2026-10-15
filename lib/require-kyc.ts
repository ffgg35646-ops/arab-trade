import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import KycRequest from "@/models/KycRequest";
import VerificationRequest from "@/models/VerificationRequest";

export async function requireVerifiedIdentity(request: NextRequest) {
  const user = await getCurrentUser(request);

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      message: "غير مسجل الدخول",
      user: null,
    };
  }

  await connectDB();

  // Both identity-verification flows are supported. Do not rely on
  // User.isVerified alone: it defaults to true for legacy/email accounts.
  const [approvedKyc, approvedVerification] = await Promise.all([
    KycRequest.exists({ userId: user._id, status: "approved" }),
    VerificationRequest.exists({ userId: user._id, status: "approved" }),
  ]);

  if (!approvedKyc && !approvedVerification) {
    return {
      ok: false as const,
      status: 403,
      message: "عفوًا، لابد من توثيق حسابك أولًا لإتمام هذه العملية.",
      user,
    };
  }

  return {
    ok: true as const,
    user,
  };
}