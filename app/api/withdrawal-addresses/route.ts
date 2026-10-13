import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import WithdrawalAddress from "@/models/WithdrawalAddress";
import { normalizePaymentNetwork, USDT_ASSET } from "@/lib/unified-usdt-wallet";

type AddressSource = "wallet" | "package";
function normalizeSource(value: unknown): AddressSource {
  return value === "package" ? "package" : "wallet";
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });

    await connectDB();
    const records = await WithdrawalAddress.find({ userId: user._id }).sort({ updatedAt: -1 }).lean();

    const addresses = records.flatMap((item: any) => {
      const result: any[] = [];
      // Previously saved addresses stay as the user's general-wallet address.
      if (String(item.address || "").trim()) {
        result.push({
          _id: String(item._id) + ":wallet",
          asset: item.asset,
          network: item.network,
          address: item.address,
          source: "wallet" as const,
          updatedAt: item.updatedAt,
        });
      }
      if (String(item.packageAddress || "").trim()) {
        result.push({
          _id: String(item._id) + ":package",
          asset: item.asset,
          network: item.network,
          address: item.packageAddress,
          source: "package" as const,
          updatedAt: item.updatedAt,
        });
      }
      return result;
    });

    return NextResponse.json({ success: true, addresses });
  } catch (error) {
    console.error("WITHDRAWAL ADDRESSES GET:", error);
    return NextResponse.json({ success: false, message: "تعذر تحميل العناوين المحفوظة" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });

    await connectDB();
    const body = await request.json();
    const asset = String(body.asset || "").trim().toUpperCase();
    const network = normalizePaymentNetwork(body.network);
    const address = String(body.address || "").trim();
    const source = normalizeSource(body.source);

    if (asset !== USDT_ASSET || !network || !address) {
      return NextResponse.json({ success: false, message: "عناوين السحب تدعم USDT فقط على شبكة TRC20 أو BNB Smart Chain (BEP20)." }, { status: 400 });
    }
    if (address.length > 500) {
      return NextResponse.json({ success: false, message: "عنوان المحفظة أطول من الحد المسموح" }, { status: 400 });
    }

    const field = source === "package" ? "packageAddress" : "address";
    const saved = await WithdrawalAddress.findOneAndUpdate(
      { userId: user._id, asset, network },
      { $set: { [field]: address } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return NextResponse.json({
      success: true,
      message: source === "package" ? "تم حفظ عنوان سحب الباقة" : "تم حفظ عنوان السحب العام",
      address,
      source,
      recordId: saved?._id ? String(saved._id) : "",
    });
  } catch (error) {
    console.error("WITHDRAWAL ADDRESSES POST:", error);
    return NextResponse.json({ success: false, message: "تعذر حفظ عنوان السحب" }, { status: 500 });
  }
}
