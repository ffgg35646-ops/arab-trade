import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

const secretText = process.env.AUTH_SECRET;

export async function requireAdminLeader(request: NextRequest) {
  if (!secretText) {
    throw new Error("AUTH_SECRET is not configured");
  }

  const token = request.cookies.get("arabtrade_session")?.value;

  if (!token) {
    return null;
  }

  try {
    const secret = new TextEncoder().encode(secretText);
    const { payload } = await jwtVerify(token, secret);

    const userId = String(payload.userId || "");

    if (!userId) {
      return null;
    }

    await connectDB();

    const user = await User.findById(userId).select(
      "_id name username email role isActive isVerified"
    );

    if (!user || !user.isActive) {
      return null;
    }

    if (user.role !== "admin_leader") {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}