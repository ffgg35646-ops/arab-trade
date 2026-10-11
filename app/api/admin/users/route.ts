import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
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

    const q = (searchParams.get("q") || "").trim();
    const status = searchParams.get("status") || "all";
    const sort = searchParams.get("sort") === "oldest" ? 1 : -1;

    const filter: Record<string, unknown> = {
      $or: [
        { role: "user" },
        { role: { $exists: false } },
      ],
    };

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const numericQ = Number(q);

      filter.$or = [
        { name: rx },
        { username: rx },
        { email: rx },
        ...(Number.isFinite(numericQ)
          ? [{ arabTradeId: numericQ }]
          : []),
      ];
    }

    if (status === "active") {
      filter.isActive = true;
    }

    if (status === "blocked") {
      filter.isActive = false;
    }

    const users = await User.find(filter)
      .select(
        "_id arabTradeId name username email role isActive isVerified referralCode createdAt updatedAt"
      )
      .sort({ createdAt: sort })
      .limit(500)
      .lean();

    return NextResponse.json({
      success: true,
      users: users.map((user: any) => ({
        ...user,
        _id: user._id ? String(user._id) : undefined,
      })),
    });
  } catch (error) {
    console.error("ADMIN USERS GET ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل المستخدمين" },
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

    if (!id || !["block", "unblock"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "طلب غير صالح" },
        { status: 400 }
      );
    }

    if (id === String(admin._id)) {
      return NextResponse.json(
        { success: false, message: "لا يمكن حظر حسابك الإداري" },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findByIdAndUpdate(
      id,
      { $set: { isActive: action === "unblock" } },
      { new: true }
    ).select("_id name username email role isActive isVerified");

    if (!user) {
      return NextResponse.json(
        { success: false, message: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        action === "block"
          ? "تم حظر المستخدم"
          : "تم فك حظر المستخدم",
      user: {
        ...user.toObject(),
        _id: String(user._id),
      },
    });
  } catch (error) {
    console.error("ADMIN USERS PATCH ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تعديل حالة المستخدم" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "معرف المستخدم مطلوب" },
        { status: 400 }
      );
    }

    if (id === String(admin._id)) {
      return NextResponse.json(
        { success: false, message: "لا يمكن حذف حسابك الإداري" },
        { status: 400 }
      );
    }

    await connectDB();

    const deleted = await User.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم حذف المستخدم",
    });
  } catch (error) {
    console.error("ADMIN USERS DELETE ERROR:", error);

    return NextResponse.json(
      { success: false, message: "تعذر حذف المستخدم" },
      { status: 500 }
    );
  }
}