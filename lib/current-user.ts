import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function getCurrentUser(request: NextRequest) {
  const secretText = process.env.AUTH_SECRET;
  if (!secretText) return null;

  const token = request.cookies.get("arabtrade_session")?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(secretText);
    const { payload } = await jwtVerify(token, secret);

    const userId = String(payload.userId || "");
    if (!userId) return null;

    await connectDB();

    return await User.findById(userId);
  } catch {
    return null;
  }
}