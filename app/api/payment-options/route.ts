import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PaymentOption from "@/models/PaymentOption";
import { getPlatformSettings } from "@/lib/platform-settings";
import Asset from "@/models/Asset";

export async function GET() {
  try {
    await connectDB();
    const platformSettings = await getPlatformSettings();

    const paymentOptions = await PaymentOption.find({})
      .sort({ enabled: -1, createdAt: 1 })
      .lean();

    const assets = await Asset.find({})
      .sort({ symbol: 1 })
      .lean();

    const methods: any[] = [];
    const existing = new Set<string>();

    /*
     * PaymentOption هو المصدر الأساسي لوسائل الدفع
     * التي أنشأها الأدمن.
     */
    for (const method of paymentOptions) {
      const asset = String(method.asset || "")
        .trim()
        .toUpperCase();

      const network = String(method.network || "").trim();

      if (!asset || !network) continue;

      const key = `${asset}:${network}`;
      const kind = String((method as any).kind || "both");
      if (existing.has(`${key}:deposit`) && existing.has(`${key}:withdrawal`)) continue;
      const row = {
        _id: String(method._id),
        name: method.name,
        asset,
        network,
        kind,
        address: method.address || "",
        minDeposit: Number(method.minDeposit || 0),
        maxDeposit: Number((method as any).maxDeposit || 0),
        minWithdrawal: Number(method.minWithdrawal || 0),
        maxWithdrawal: Number((method as any).maxWithdrawal || 0),
        withdrawalFee: Number((method as any).withdrawalFee || 0),
        warning: String((method as any).warning || ""),
        enabled: Boolean(method.enabled),
        depositEnabled: kind !== "withdrawal" && method.depositEnabled !== false,
        withdrawalEnabled: kind !== "deposit" && method.withdrawalEnabled !== false,
        source: "payment-option",
      };
      if (row.depositEnabled) existing.add(`${key}:deposit`);
      if (row.withdrawalEnabled) existing.add(`${key}:withdrawal`);
      methods.push(row);
    }

    /*
     * Asset networks تظل متاحة للأصول التي لا يوجد لها
     * PaymentOption بنفس العملة والشبكة.
     */
    for (const asset of assets as any[]) {
      if (!asset.enabled) continue;

      const networks = Array.isArray(asset.networks)
        ? asset.networks
        : [];

      for (const network of networks) {
        if (!network.enabled) continue;

        const assetCode = String(asset.symbol || "")
          .trim()
          .toUpperCase();

        const networkCode = String(network.code || "").trim();

        if (!assetCode || !networkCode) continue;

        const key = `${assetCode}:${networkCode}`;

                const depositEnabled =
          asset.depositEnabled === true &&
          network.depositEnabled === true &&
          existing.has(key + ':deposit') === false;

        const withdrawalEnabled =
          asset.withdrawalEnabled === true &&
          network.withdrawalEnabled === true &&
          existing.has(key + ':withdrawal') === false;

        if (!depositEnabled && !withdrawalEnabled) continue;

        existing.add(key);

        methods.push({
          _id: `${asset._id}:${networkCode}`,
          name: asset.name,
          asset: assetCode,
          network: networkCode,
          address: network.depositAddress || "",
          minDeposit: Number(network.minDeposit || 0),
          maxDeposit: Number(network.maxDeposit || 0),
          minWithdrawal: Number(network.minWithdrawal || 0),
          enabled: true,
          depositEnabled,
          withdrawalEnabled,
          maxWithdrawal: Number(network.maxWithdrawal || 0),
          withdrawalFee: Number(network.withdrawalFee || 0),
          warning: network.warning || "",
          source: "asset-network",
        });
      }
    }

    methods.sort((a, b) => {
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1;
      }

      return String(a.name).localeCompare(
        String(b.name),
        "ar"
      );
    });

    return NextResponse.json({
      success: true,
      methods,
      depositsEnabled: platformSettings.deposits?.enabled !== false,
      limits: {
        minDeposit: Number(platformSettings.deposits?.minAmount || 0),
        maxDeposit: Number(platformSettings.deposits?.maxAmount || 0),
        minWithdrawal: Number(platformSettings.withdrawals?.minAmount || 0),
        minGeneralWithdrawal: Number(platformSettings.withdrawals?.minGeneralWithdrawal ?? platformSettings.withdrawals?.minAmount ?? 0),
        maxWithdrawal: Number(platformSettings.withdrawals?.maxAmount || 0),
        dailyWithdrawalLimit: Number(platformSettings.withdrawals?.dailyLimit || 0),
      },
    });
  } catch (error) {
    console.error("PAYMENT OPTIONS GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: "تعذر تحميل وسائل الدفع",
      },
      { status: 500 }
    );
  }
}