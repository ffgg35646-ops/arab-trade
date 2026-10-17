import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import PaymentOption from "@/models/PaymentOption";
import { normalizePaymentNetwork, USDT_ASSET } from "@/lib/unified-usdt-wallet";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 },
      );
    }

    await connectDB();

    const [rows, settings] = await Promise.all([
      PaymentOption.find({
        asset: USDT_ASSET,
        $or: [
          { kind: "deposit" },
          { kind: "both" },
          { kind: { $exists: false } },
        ],
      })
        .sort({ createdAt: -1 })
        .lean(),
      getPlatformSettings(),
    ]);

    const seenNetworks = new Set<string>();
    const methods = rows.flatMap((item: any) => {
      const network = normalizePaymentNetwork(item.network);
      const address = String(item.address || "").trim();
      if (
        !network ||
        item.enabled === false ||
        item.depositEnabled === false ||
        !address
      ) {
        return [];
      }

      const key = USDT_ASSET + ":" + network;
      if (seenNetworks.has(key)) return [];
      seenNetworks.add(key);

      return [{
        _id: String(item._id),
        name: String(item.name || network),
        asset: USDT_ASSET,
        network,
        address,
        minDeposit: Number(item.minDeposit || 0),
        maxDeposit: Number(item.maxDeposit || 0),
        enabled: true,
        depositEnabled: true,
      }];
    });

    return NextResponse.json({
      success: true,
      depositsEnabled: settings.deposits?.enabled !== false,
      limits: {
        minDeposit: Number(settings.deposits?.minAmount || 0),
        maxDeposit: Number(settings.deposits?.maxAmount || 0),
      },
      methods,
    });
  } catch (error) {
    console.error("PAYMENT OPTIONS GET:", error);
    return NextResponse.json(
      { success: false, message: "تعذر تحميل وسائل الإيداع" },
      { status: 500 },
    );
  }
}
