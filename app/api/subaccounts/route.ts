import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import mongoose, { Schema, Model, Document } from "mongoose";

interface ISubaccount extends Document {
  ownerId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  permissions: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISubaccount>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    code: { type: String, required: true },
    permissions: { type: [String], default: ["read", "trade"] },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Subaccount: Model<ISubaccount> =
  (mongoose.models.Subaccount as Model<ISubaccount>) ||
  mongoose.model<ISubaccount>("Subaccount", schema);

export async function GET(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const items = await Subaccount.find({
    ownerId: user._id,
  })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    success: true,
    subaccounts: items,
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

  const name = String(body.name || "").trim();

  if (!name) {
    return NextResponse.json(
      { success: false, message: "اسم الحساب الفرعي مطلوب" },
      { status: 400 }
    );
  }

  const code =
    "SUB-" +
    Math.random().toString(36).slice(2, 10).toUpperCase();

  const item = await Subaccount.create({
    ownerId: user._id,
    name,
    code,
    permissions: Array.isArray(body.permissions)
      ? body.permissions.filter((x: unknown) => typeof x === "string")
      : ["read", "trade"],
    enabled: true,
  });

  return NextResponse.json(
    { success: true, subaccount: item },
    { status: 201 }
  );
}

export async function PATCH(request: NextRequest) {
  await connectDB();

  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "غير مصرح" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const item = await Subaccount.findOne({
    _id: String(body.id || ""),
    ownerId: user._id,
  });

  if (!item) {
    return NextResponse.json(
      { success: false, message: "الحساب الفرعي غير موجود" },
      { status: 404 }
    );
  }

  if (typeof body.enabled === "boolean") {
    item.enabled = body.enabled;
  }

  if (typeof body.name === "string" && body.name.trim()) {
    item.name = body.name.trim();
  }

  if (Array.isArray(body.permissions)) {
    item.permissions = body.permissions.filter(
      (x: unknown) => typeof x === "string"
    );
  }

  await item.save();

  return NextResponse.json({
    success: true,
    subaccount: item,
  });
}