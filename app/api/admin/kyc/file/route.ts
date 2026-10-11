import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import KycRequest from "@/models/KycRequest";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);

    if (!admin) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "");
    const type = String(searchParams.get("type") || "");

    if (!id || !["document", "selfie"].includes(type)) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    await connectDB();

    const kyc = await KycRequest.findById(id).select(
      "documentPath selfiePath"
    );

    if (!kyc) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const relativePath =
      type === "document" ? kyc.documentPath : kyc.selfiePath;

    const root = path.resolve(process.cwd(), "private", "kyc");

    // The database stores paths inside private/kyc.
    // Only the path portion below private/kyc is allowed.
    const normalizedRelative = String(relativePath || "")
      .replace(/^private[\\/]+kyc[\\/]*/i, "")
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
    console.error("ADMIN KYC FILE ERROR:", error);
    return new NextResponse("Not Found", { status: 404 });
  }
}