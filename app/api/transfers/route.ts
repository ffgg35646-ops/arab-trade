import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedIdentity } from "@/lib/require-kyc";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import { getIdempotentResponse, hashRequest } from "@/lib/idempotency";
import IdempotencyKey from "@/models/IdempotencyKey";
import Notification from "@/models/Notification";
import { executeInternalWalletTransfer } from "@/lib/internal-wallet-transfer";

const TRANSFER_ROUTE = "/api/transfers";

export async function POST(request: NextRequest) {
  let session: mongoose.ClientSession | null = null;
  let requestHash = "";
  let idempotencyUserId: mongoose.Types.ObjectId | null = null;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";

  try {
    const identity = await requireVerifiedIdentity(request);
    if (!identity.ok) {
      return NextResponse.json(
        { success: false, message: identity.message },
        { status: identity.status }
      );
    }
    const user = identity.user;
    idempotencyUserId = user._id;

    await connectDB();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "بيانات التحويل غير صحيحة" },
        { status: 400 }
      );
    }

    const asset = String(body.asset || "").trim().toUpperCase();
    const from = String(body.from || "").trim().toLowerCase();
    const to = String(body.to || "").trim().toLowerCase();
    const rawAmount = Number(body.amount);

    if (
      !asset ||
      !["spot", "funding"].includes(from) ||
      !["spot", "funding"].includes(to) ||
      from === to ||
      !Number.isFinite(rawAmount) ||
      rawAmount <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "بيانات التحويل غير صحيحة" },
        { status: 400 }
      );
    }

    const amount = Number(rawAmount.toFixed(12));
    if (!Number.isFinite(amount) || amount <= 0 || amount !== rawAmount) {
      return NextResponse.json(
        { success: false, message: "دقة مبلغ التحويل يجب ألا تتجاوز 12 منزلة عشرية" },
        { status: 400 }
      );
    }

    if (idempotencyKey.length > 200) {
      return NextResponse.json(
        { success: false, message: "مفتاح أمان التحويل غير صالح" },
        { status: 400 }
      );
    }

    const requestHashValue = hashRequest({ asset, amount, from, to });
    requestHash = requestHashValue;

    if (idempotencyKey) {
      const existing = await getIdempotentResponse(user._id, TRANSFER_ROUTE, idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHashValue) {
          return NextResponse.json(
            { success: false, message: "مفتاح الطلب مستخدم مع بيانات تحويل مختلفة" },
            { status: 409 }
          );
        }
        if (existing.responseStatus !== 202 && existing.responseBody) {
          return NextResponse.json(existing.responseBody, { status: existing.responseStatus });
        }
        return NextResponse.json(
          { success: false, message: "التحويل قيد المعالجة؛ أعد المحاولة بنفس المفتاح" },
          { status: 409 }
        );
      }
    }

    await migrateLegacyDepositBalancesToSpotWallet(user._id);

    session = await mongoose.startSession();
    let finalResponseBody: Record<string, unknown> | null = null;
    const finalResponseStatus = 201;

    await session.withTransaction(async () => {
      finalResponseBody = null;
      if (idempotencyKey) {
        try {
          await IdempotencyKey.create(
            [{
              userId: user._id,
              key: idempotencyKey,
              route: TRANSFER_ROUTE,
              requestHash: requestHashValue,
              responseStatus: 202,
              responseBody: { success: true, pending: true },
            }],
            { session, ordered: true }
          );
        } catch (error: any) {
          if (error?.code === 11000) {
            throw new Error("IDEMPOTENCY_KEY_ALREADY_USED");
          }
          throw error;
        }
      }

      const transfer = await executeInternalWalletTransfer({
        userId: user._id,
        asset,
        amount,
        from: from as "spot" | "funding",
        to: to as "spot" | "funding",
        session: session!,
      });

      finalResponseBody = {
        success: true,
        message: "تم تنفيذ التحويل الداخلي وتحديث رصيد المحفظتين",
        transfer,
      };

      if (idempotencyKey) {
        const updated = await IdempotencyKey.updateOne(
          {
            userId: user._id,
            route: TRANSFER_ROUTE,
            key: idempotencyKey,
          },
          {
            $set: {
              responseStatus: finalResponseStatus,
              responseBody: finalResponseBody,
            },
          },
          { session }
        );
        if (updated.matchedCount !== 1) {
          throw new Error("TRANSFER_IDEMPOTENCY_RECORD_NOT_FOUND");
        }
      }
    });

    if (!finalResponseBody) {
      throw new Error("TRANSFER_RESPONSE_NOT_CREATED");
    }

    // Notification delivery is ancillary: it must not turn a committed transfer into a false failure.
    await Notification.create({
      userId: user._id,
      type: "account",
      title: "تم تنفيذ التحويل",
      message: `تم تحويل ${amount} ${asset} من ${from === "spot" ? "محفظة التداول" : "محفظة التمويل"} إلى ${to === "spot" ? "محفظة التداول" : "محفظة التمويل"}.`,
      read: false,
    }).catch((notificationError) => {
      console.error("TRANSFER NOTIFICATION:", notificationError);
    });

    return NextResponse.json(finalResponseBody, { status: finalResponseStatus });
  } catch (error: any) {
    if (error?.message === "IDEMPOTENCY_KEY_ALREADY_USED" && idempotencyKey && idempotencyUserId) {
      const existing = await IdempotencyKey.findOne({
        userId: idempotencyUserId,
        route: TRANSFER_ROUTE,
        key: idempotencyKey,
      }).lean();

      if (existing) {
        if (existing.requestHash !== requestHash) {
          return NextResponse.json(
            { success: false, message: "مفتاح الطلب مستخدم مع بيانات تحويل مختلفة" },
            { status: 409 }
          );
        }
        if (existing.responseStatus !== 202 && existing.responseBody) {
          return NextResponse.json(existing.responseBody, { status: existing.responseStatus });
        }
        return NextResponse.json(
          { success: false, message: "التحويل قيد المعالجة؛ أعد المحاولة بنفس المفتاح" },
          { status: 409 }
        );
      }
    }

    if (error?.message === "INSUFFICIENT_TRANSFER_BALANCE") {
      return NextResponse.json(
        { success: false, message: "الرصيد المتاح غير كافٍ في المحفظة المصدر" },
        { status: 400 }
      );
    }

    if (error?.message === "INVALID_TRANSFER_INPUT") {
      return NextResponse.json(
        { success: false, message: "بيانات التحويل غير صحيحة" },
        { status: 400 }
      );
    }

    console.error("TRANSFER ERROR:", error);
    return NextResponse.json(
      { success: false, message: "تعذر تنفيذ التحويل. إذا انقطع الاتصال فأعد المحاولة بنفس الطلب دون تغيير بياناته." },
      { status: 500 }
    );
  } finally {
    if (session) await session.endSession();
  }
}
