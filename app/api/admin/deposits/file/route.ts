import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import DepositRequest from "@/models/DepositRequest";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "");

    if (!id) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    await connectDB();

    const deposit = await DepositRequest.findById(id)
      .select("screenshotPath")
      .lean();

    if (!deposit?.screenshotPath) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const root = path.resolve(
      process.cwd(),
      "private",
      "deposits"
    );

    const normalizedRelative = String(
      deposit.screenshotPath || ""
    )
      .replace(/^private[\\/]+deposits[\\/]*/i, "")
      .replace(/^[/\\]+/, "");

    const absolute = path.join(
      root,
      normalizedRelative
    );

    const relativeToRoot = path.relative(
      root,
      absolute
    );

    if (
      relativeToRoot.startsWith("..") ||
      path.isAbsolute(relativeToRoot)
    ) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const buffer = await fs.readFile(absolute);
    const ext = path.extname(absolute).toLowerCase();

    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("ADMIN DEPOSIT FILE ERROR:", error);
    return new NextResponse("Not Found", { status: 404 });
  }
}