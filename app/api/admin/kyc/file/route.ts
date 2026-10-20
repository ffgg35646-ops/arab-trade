import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { connectDB } from "@/lib/mongodb";
import { requireAdminLeader } from "@/lib/admin-auth";
import KycRequest from "@/models/KycRequest";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminLeader(request);
    if (!admin) return new NextResponse("Unauthorized", { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "");
    const type = String(searchParams.get("type") || "");

    if (!id || !["document", "documentBack", "selfie"].includes(type)) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    await connectDB();
    const kyc = await KycRequest.findById(id).select(
      "documentPath selfiePath identityFrontMime identityBackMime selfieMime +identityFrontData +identityBackData +selfieData"
    );
    if (!kyc) return new NextResponse("Not Found", { status: 404 });

    let binary: Buffer | null = null;
    let contentType = "image/jpeg";
    let relativePath = "";

    if (type === "document" && kyc.identityFrontData) {
      binary = Buffer.from(kyc.identityFrontData);
      contentType = kyc.identityFrontMime || contentType;
    } else if (type === "documentBack" && kyc.identityBackData) {
      binary = Buffer.from(kyc.identityBackData);
      contentType = kyc.identityBackMime || contentType;
    } else if (type === "selfie" && kyc.selfieData) {
      binary = Buffer.from(kyc.selfieData);
      contentType = kyc.selfieMime || contentType;
    } else {
      if (type === "documentBack") {
        return new NextResponse("Not Found", { status: 404 });
      }
      relativePath = type === "selfie" ? kyc.selfiePath : kyc.documentPath;
    }

    if (!binary) {
      const root = path.resolve(process.cwd(), "private", "kyc");
      const normalizedRelative = String(relativePath || "")
        .replace(/^private[\\/]+kyc[\\/]*/i, "")
        .replace(/^[/\\]+/, "");
      const absolute = path.join(root, normalizedRelative);
      const relativeToRoot = path.relative(root, absolute);

      if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
        return new NextResponse("Forbidden", { status: 403 });
      }

      binary = await fs.readFile(absolute);
      const ext = path.extname(absolute).toLowerCase();
      contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      return new NextResponse("Unsupported Media Type", { status: 415 });
    }

    return new NextResponse(binary, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("ADMIN KYC FILE ERROR:", error);
    return new NextResponse("Not Found", { status: 404 });
  }
}
