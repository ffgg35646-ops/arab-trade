import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import MarginPosition from "@/models/MarginPosition";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    await connectDB();

    const positions = await MarginPosition.find({
      userId: user._id
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ positions });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "تعذر تحميل صفقات المارجن" },
      { status: 400 }
    );
  }
}