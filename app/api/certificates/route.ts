import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Certificate from "@/models/Certificate";
import Wallet from "@/models/Wallet";
import Trade from "@/models/Trade";

function id() {
  return "CERT-" + Date.now() + "-" +
    Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function GET(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const certificates = await Certificate.find({
    userId: user._id,
  })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    success: true,
    certificates,
  });
}

export async function POST(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const type = String(body.type || "account");

  if (!["account", "trading", "asset"].includes(type)) {
    return NextResponse.json(
      { success: false, message: "نوع الشهادة غير صحيح" },
      { status: 400 }
    );
  }

  const wallet = await Wallet.findOne({
    userId: user._id,
    type: "spot",
  }).lean();

  const tradeCount = await Trade.countDocuments({
    $or: [
      { buyerId: user._id },
      { sellerId: user._id },
    ],
  });

  const certificate = await Certificate.create({
    userId: user._id,
    type: type as "account" | "trading" | "asset",
    title:
      type === "account"
        ? "شهادة حالة الحساب"
        : type === "trading"
          ? "شهادة سجل التداول"
          : "شهادة الأصول",
    referenceId: id(),
    data: {
      userId: String(user._id),
      email: user.email,
      username: user.username,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      tradeCount,
      balances: wallet?.balances || [],
      generatedAt: new Date(),
    },
  });

  return NextResponse.json(
    { success: true, certificate },
    { status: 201 }
  );
}