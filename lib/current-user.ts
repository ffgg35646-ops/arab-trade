import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

const secretText = process.env.AUTH_SECRET;

export async function getCurrentUser(request: NextRequest) {
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