import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مسجل الدخول",
        },
        { status: 401 }
      );
    }

    await connectDB();

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({
        userId: user._id,
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),

      Notification.countDocuments({
        userId: user._id,
        read: false,
      }),
    ]);

    const safeNotifications = notifications.map((item: any) => ({
      _id: String(item._id),
      userId: String(item.userId),
      type: item.type,
      title: String(item.title || ""),
      message: String(item.message || ""),
      read: Boolean(item.read),
      createdAt: item.createdAt
        ? new Date(item.createdAt).toISOString()
        : null,
    }));

    return NextResponse.json({
      success: true,
      notifications: safeNotifications,
      unreadCount,
    });
  } catch (error) {
    console.error("NOTIFICATIONS GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل الإشعارات",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مسجل الدخول",
        },
        { status: 401 }
      );
    }

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();

    if (id) {
      await Notification.updateOne(
        {
          _id: id,
          userId: user._id,
        },
        {
          $set: {
            read: true,
          },
        }
      );
    } else {
      await Notification.updateMany(
        {
          userId: user._id,
          read: false,
        },
        {
          $set: {
            read: true,
          },
        }
      );
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث الإشعارات",
    });
  } catch (error) {
    console.error("NOTIFICATIONS PATCH:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحديث الإشعارات",
      },
      { status: 500 }
    );
  }
}