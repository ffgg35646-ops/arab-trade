import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import KycRequest from "@/models/KycRequest";

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

  const approved = await KycRequest.exists({
    userId: user._id,
    status: "approved",
  });

  if (!approved) {
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