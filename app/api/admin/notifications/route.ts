import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import User from "@/models/User";
import Notification from "@/models/Notification";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const q = String(
      request.nextUrl.searchParams.get("q") || ""
    ).trim();

    const searchBy =
      request.nextUrl.searchParams.get("searchBy") ===
      "arabTradeId"
        ? "arabTradeId"
        : "email";

    if (!q) {
      return NextResponse.json({
        success: true,
        users: [],
      });
    }

    await connectDB();

    let users;

    if (searchBy === "email") {
      users = await User.find({
        email: {
          $regex: `^${escapeRegex(q)}`,
          $options: "i",
        },
      })
        .select("_id name username email arabTradeId")
        .sort({ email: 1 })
        .limit(20)
        .lean();
    } else {
      const numericId = Number(q);

      if (!Number.isFinite(numericId)) {
        return NextResponse.json({
          success: true,
          users: [],
        });
      }

      users = await User.find({
        arabTradeId: numericId,
      })
        .select("_id name username email arabTradeId")
        .limit(20)
        .lean();
    }

    return NextResponse.json({
      success: true,
      users: users.map((user: any) => ({
        _id: String(user._id),
        name: user.name,
        username: user.username,
        email: user.email,
        arabTradeId: user.arabTradeId,
      })),
    });
  } catch (error) {
    console.error("ADMIN NOTIFICATIONS GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر البحث عن المستخدمين",
      },
      { status: 500 }
    );
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const target =
      body.target === "all" ? "all" : "user";

    const title =
      String(
        body.title ||
          "إشعار من إدارة ArabTrade"
      ).trim();

    const message =
      String(body.message || "").trim();

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          message: "نص الرسالة مطلوب",
        },
        { status: 400 }
      );
    }

    await connectDB();

    if (target === "user") {
      const userId = String(body.userId || "").trim();

      if (!userId) {
        return NextResponse.json(
          {
            success: false,
            message: "اختر مستخدمًا أولًا",
          },
          { status: 400 }
        );
      }

      const user = await User.findOne({
        _id: userId,
      })
        .select("_id")
        .lean();

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: "المستخدم غير موجود أو غير مفعل",
          },
          { status: 404 }
        );
      }

      await Notification.create({
        userId: user._id,
        type: "system",
        title,
        message,
        read: false,
      });

      return NextResponse.json({
        success: true,
        count: 1,
        message: "تم إرسال الإشعار إلى المستخدم",
      });
    }

    const users = await User.find({
      role: "user",
      isActive: true,
    })
      .select("_id")
      .lean();

    if (!users.length) {
      return NextResponse.json(
        {
          success: false,
          message: "لا يوجد مستخدمون مفعلون",
        },
        { status: 404 }
      );
    }

    await Notification.insertMany(
      users.map((user: any) => ({
        userId: user._id,
        type: "system",
        title,
        message,
        read: false,
      }))
    );

    return NextResponse.json({
      success: true,
      count: users.length,
      message: `تم إرسال الإشعار إلى ${users.length} مستخدم`,
    });
  } catch (error) {
    console.error("ADMIN NOTIFICATIONS POST:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر إرسال الإشعار",
      },
      { status: 500 }
    );
  }
}