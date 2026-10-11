import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) {
      return NextResponse.json({ success: false, message: "غير مصرح" }, { status: 401 });
    }

    await connectDB();
    const mongoose = await import('mongoose');
    const db = mongoose.connection.db;

    if (!db) {
      throw new Error("Database connection unavailable");
    }

    const orders = await db.collection("futuresorders")
      .find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    const ordersSafe = orders.map((item) => ({
      ...item,
      _id: item._id ? String(item._id) : undefined
    }));

    const positions = await db.collection("futurespositions")
      .find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    const positionsSafe = positions.map((item) => ({
      ...item,
      _id: item._id ? String(item._id) : undefined
    }));

    const fundingPayments = await db.collection("fundingpayments")
      .find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    const fundingPaymentsSafe = fundingPayments.map((item) => ({
      ...item,
      _id: item._id ? String(item._id) : undefined
    }));

    return NextResponse.json({
      success: true,
      orders: ordersSafe,
      positions: positionsSafe,
      fundingPayments: fundingPaymentsSafe
    });
  } catch (error) {
    console.error("ADMIN DATA ERROR:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل البيانات" }, { status: 500 });
  }
}