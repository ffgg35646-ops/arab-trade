import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import DepositRequest from "@/models/DepositRequest";

function imageResponse(buffer: Buffer, contentType: string) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  const body = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(body).set(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": allowed.has(contentType) ? contentType : "image/jpeg",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return new NextResponse("Unauthorized", { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "");
    if (!id) return new NextResponse("Bad Request", { status: 400 });

    await connectDB();
    const deposit = await DepositRequest.findById(id)
      .select("+screenshotData screenshotContentType screenshotStorage screenshotPath")
      .lean();

    if (!deposit) return new NextResponse("Not Found", { status: 404 });

    if (deposit.screenshotData) {
      const bytes = Buffer.isBuffer(deposit.screenshotData)
        ? deposit.screenshotData
        : Buffer.from(deposit.screenshotData as unknown as Uint8Array);
      return imageResponse(bytes, String(deposit.screenshotContentType || "image/jpeg"));
    }

    // Old proofs were stored on disk before the durable MongoDB uploader was introduced.
    if (!deposit.screenshotPath || deposit.screenshotStorage === "mongodb") {
      return new NextResponse("Not Found", { status: 404 });
    }

    const root = path.resolve(process.cwd(), "private", "deposits");
    const normalizedRelative = String(deposit.screenshotPath || "")
      .replace(/^private[\\/]+deposits[\\/]*/i, "")
      .replace(/^[/\\]+/, "");
    const absolute = path.join(root, normalizedRelative);
    const relativeToRoot = path.relative(root, absolute);

    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const buffer = await fs.readFile(absolute);
    const ext = path.extname(absolute).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return imageResponse(buffer, contentType);
  } catch (error) {
    console.error("ADMIN DEPOSIT FILE ERROR:", error);
    return new NextResponse("Not Found", { status: 404 });
  }
}
