import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { connectDB } from "@/lib/mongodb";
import DepositRequest from "@/models/DepositRequest";
import DepositBalance from "@/models/DepositBalance";
import Asset from "@/models/Asset";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import Notification from "@/models/Notification";
import PaymentOption from "@/models/PaymentOption";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE = 8 * 1024 * 1024;

function extension(type: string) {
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  return ".jpg";
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const [deposits, depositBalances] = await Promise.all([
      DepositRequest.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      DepositBalance.find({ userId: user._id }).sort({ asset: 1 }).lean(),
    ]);

    return NextResponse.json({
      success: true,
      deposits,
      depositBalances,
    });
  } catch (error) {
    console.error("DEPOSITS GET:", error);

    return NextResponse.json(
      { success: false, message: "تعذر تحميل الإيداعات" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "غير مسجل الدخول" },
        { status: 401 }
      );
    }

    await connectDB();

    const settings = await getPlatformSettings();

    if (!settings.deposits.enabled) {
      return NextResponse.json(
        { success: false, message: "الإيداع متوقف حاليًا" },
        { status: 403 }
      );
    }

    const form = await request.formData();

    const assetCode = String(form.get("asset") || "")
      .trim()
      .toUpperCase();

    const networkCode = String(form.get("network") || "").trim();
    const amount = Number(form.get("amount"));
    const txHash = String(form.get("txHash") || "").trim();

    const screenshot = form.get("screenshot");

    if (
      !assetCode ||
      !networkCode ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "بيانات الإيداع غير مكتملة" },
        { status: 400 }
      );
    }

    if (!(screenshot instanceof File) || screenshot.size === 0) {
      return NextResponse.json(
        { success: false, message: "صورة التحويل مطلوبة" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(screenshot.type)) {
      return NextResponse.json(
        {
          success: false,
          message: "صيغة الصورة يجب أن تكون JPG أو PNG أو WEBP",
        },
        { status: 400 }
      );
    }

    if (screenshot.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, message: "حجم الصورة يجب ألا يتجاوز 8MB" },
        { status: 400 }
      );
    }

    let depositAddress = "";
    let minDeposit = 0;

    const asset = await Asset.findOne({
      symbol: assetCode,
      enabled: true,
      depositEnabled: true,
    }).lean();

    if (asset) {
      const network = (asset.networks || []).find(
        (item: any) =>
          item.code === networkCode &&
          item.enabled &&
          item.depositEnabled
      );

      if (!network) {
        return NextResponse.json(
          {
            success: false,
            message: "الشبكة غير متاحة للإيداع",
          },
          { status: 400 }
        );
      }

      if (!network.depositAddress) {
        return NextResponse.json(
          {
            success: false,
            message: "عنوان الإيداع غير متوفر لهذه الشبكة",
          },
          { status: 400 }
        );
      }

      depositAddress = network.depositAddress;
      minDeposit = Number(network.minDeposit || 0);
    } else {
      const payment = await PaymentOption.findOne({
        asset: assetCode,
        network: networkCode,
        enabled: true,
        depositEnabled: { $ne: false },
      }).lean();

      if (!payment) {
        return NextResponse.json(
          {
            success: false,
            message: "وسيلة الدفع غير متاحة حاليًا",
          },
          { status: 400 }
        );
      }

      depositAddress = payment.address;
      minDeposit = Number(payment.minDeposit || 0);
    }

    minDeposit = Math.max(minDeposit, Number(settings.deposits.minAmount || 0));

    if (amount < minDeposit) {
      return NextResponse.json(
        {
          success: false,
          message: `الحد الأدنى للإيداع هو ${minDeposit}`,
        },
        { status: 400 }
      );
    }

    if (
      Number.isFinite(settings.deposits.maxAmount) &&
      amount > settings.deposits.maxAmount
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `الحد الأقصى للإيداع هو ${settings.deposits.maxAmount}`,
        },
        { status: 400 }
      );
    }

    const folder = path.join(
      process.cwd(),
      "private",
      "deposits",
      String(user._id),
      randomUUID()
    );

    await fs.mkdir(folder, { recursive: true });

    const filename = `screenshot${extension(screenshot.type)}`;
    const absolutePath = path.join(folder, filename);

    await fs.writeFile(
      absolutePath,
      Buffer.from(await screenshot.arrayBuffer())
    );

    const screenshotPath = path.relative(process.cwd(), absolutePath);

    const deposit = await DepositRequest.create({
      userId: user._id,
      asset: assetCode,
      network: networkCode,
      amount,
      txHash,
      address: depositAddress,
      status: "pending",
      screenshotPath,
    });

    await Notification.create({
      userId: user._id,
      type: "deposit",
      title: "تم إنشاء طلب إيداع",
      message: `تم تسجيل طلب إيداع ${amount} ${assetCode} على شبكة ${networkCode} وهو قيد المراجعة.`,
      read: false,
    });

    return NextResponse.json(
      {
        success: true,
        message: "تم إنشاء طلب الإيداع وإرساله للمراجعة",
        deposit: {
          id: String(deposit._id),
          status: deposit.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("DEPOSITS POST:", error);

    return NextResponse.json(
      { success: false, message: "تعذر إنشاء طلب الإيداع" },
      { status: 500 }
    );
  }
}