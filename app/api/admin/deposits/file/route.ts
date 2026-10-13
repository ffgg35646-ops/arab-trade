import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import DepositRequest from "@/models/DepositRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toImageBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);

  if (!value || typeof value !== "object") return null;
  const binary = value as {
    buffer?: unknown;
    position?: unknown;
    value?: (asRaw?: boolean) => unknown;
    type?: unknown;
    data?: unknown;
  };

  // Lean Mongoose queries may return MongoDB BSON Binary values instead of Node Buffers.
  if (binary.buffer instanceof Uint8Array) {
    const length = typeof binary.position === "number"
      ? Math.max(0, Math.min(binary.position, binary.buffer.byteLength))
      : binary.buffer.byteLength;
    return Buffer.from(binary.buffer.subarray(0, length));
  }

  if (binary.type === "Buffer" && Array.isArray(binary.data)) {
    return Buffer.from(binary.data);
  }

  if (typeof binary.value === "function") {
    const raw = binary.value(true);
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "binary");
  }

  return null;
}

function actualImageType(buffer: Buffer, fallback: string) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return ["image/jpeg", "image/png", "image/webp"].includes(fallback) ? fallback : "";
}

function imageResponse(buffer: Buffer, contentType: string) {
  const detectedType = actualImageType(buffer, contentType);
  if (!buffer.length || !detectedType) return new NextResponse("Invalid image data", { status: 415 });
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": detectedType,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
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

    const screenshotBytes = toImageBuffer(deposit.screenshotData);
    if (screenshotBytes?.length) {
      return imageResponse(screenshotBytes, String(deposit.screenshotContentType || ""));
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
