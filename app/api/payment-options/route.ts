import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import PaymentOption from "@/models/PaymentOption";
import Asset from "@/models/Asset";
import { normalizePaymentNetwork, USDT_ASSET } from "@/lib/unified-usdt-wallet";

type DepositMethod = {
  _id: string;
  name: string;
  asset: string;
  network: string;
  address: string;
  minDeposit: number;
  maxDeposit: number;
  enabled: boolean;
  depositEnabled: boolean;
  source: "payment-option" | "asset-network";
};

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

    // Read both admin configuration locations. PaymentOption is the primary
    // source; enabled Asset networks are a fallback when no active option exists.
    const [paymentRows, assets, settings] = await Promise.all([
      PaymentOption.find({ asset: USDT_ASSET })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
      Asset.find({
        symbol: USDT_ASSET,
        enabled: { $ne: false },
        depositEnabled: { $ne: false },
      })
        .select("name symbol networks sortOrder")
        .sort({ sortOrder: 1 })
        .lean(),
      getPlatformSettings(),
    ]);

    const seenNetworks = new Set<string>();
    const methods: DepositMethod[] = [];

    for (const item of paymentRows as any[]) {
      const network = normalizePaymentNetwork(item.network);
      const address = String(item.address || "").trim();
      if (
        !network ||
        item.enabled === false ||
        item.depositEnabled === false ||
        !address
      ) {
        continue;
      }

      const key = `${USDT_ASSET}:${network}`;
      if (seenNetworks.has(key)) continue;
      seenNetworks.add(key);
      methods.push({
        _id: String(item._id),
        name: String(item.name || network),
        asset: USDT_ASSET,
        network,
        address,
        minDeposit: Number(item.minDeposit || 0),
        maxDeposit: Number(item.maxDeposit || 0),
        enabled: true,
        depositEnabled: true,
        source: "payment-option",
      });
    }

    for (const asset of assets as any[]) {
      for (const networkRow of Array.isArray(asset.networks) ? asset.networks : []) {
        const network = normalizePaymentNetwork(networkRow.code);
        const address = String(networkRow.depositAddress || "").trim();
        if (
          !network ||
          networkRow.enabled === false ||
          networkRow.depositEnabled === false ||
          !address
        ) {
          continue;
        }

        const key = `${USDT_ASSET}:${network}`;
        if (seenNetworks.has(key)) continue;
        seenNetworks.add(key);
        methods.push({
          _id: String(networkRow._id || `${asset._id}:${network}`),
          name: String(networkRow.name || network),
          asset: USDT_ASSET,
          network,
          address,
          minDeposit: Number(networkRow.minDeposit || 0),
          maxDeposit: Number(networkRow.maxDeposit || 0),
          enabled: true,
          depositEnabled: true,
          source: "asset-network",
        });
      }
    }

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
