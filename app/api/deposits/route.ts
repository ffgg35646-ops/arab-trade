import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import DepositRequest from "@/models/DepositRequest";
import DepositBalance from "@/models/DepositBalance";
import Asset from "@/models/Asset";
import { getCurrentUser } from "@/lib/current-user";
import { getPlatformSettings } from "@/lib/platform-settings";
import Notification from "@/models/Notification";
import PaymentOption from "@/models/PaymentOption";
import User from "@/models/User";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE = 4 * 1024 * 1024;

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
        .select("-screenshotData")
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
        { success: false, message: "حجم الصورة يجب ألا يتجاوز 4MB" },
        { status: 400 }
      );
    }

    let depositAddress = "";
    let minDeposit = 0;
    let maxDeposit = 0;

    // Validate the same payment method that was displayed in the user's form.
    // Do not bypass a disabled PaymentOption through a legacy Asset network.
    const payment = await PaymentOption.findOne({
      asset: assetCode,
      network: networkCode,
    }).lean();

    if (payment) {
      if (!payment.enabled || payment.depositEnabled === false) {
        return NextResponse.json(
          { success: false, message: "وسيلة الإيداع متوقفة حاليًا" },
          { status: 400 }
        );
      }
      if (!String(payment.address || "").trim()) {
        return NextResponse.json(
          { success: false, message: "عنوان الإيداع غير متوفر لهذه الوسيلة" },
          { status: 400 }
        );
      }
      depositAddress = payment.address;
      minDeposit = Number(payment.minDeposit || 0);
      maxDeposit = Number(payment.maxDeposit || 0);
    } else {
      const asset = await Asset.findOne({
        symbol: assetCode,
        enabled: true,
        depositEnabled: true,
      }).lean();

      const network = asset && (asset.networks || []).find(
        (item: any) =>
          item.code === networkCode &&
          item.enabled &&
          item.depositEnabled
      );

      if (!network) {
        return NextResponse.json(
          { success: false, message: "وسيلة الإيداع أو الشبكة غير متاحة حاليًا" },
          { status: 400 }
        );
      }

      if (!String(network.depositAddress || "").trim()) {
        return NextResponse.json(
          { success: false, message: "عنوان الإيداع غير متوفر لهذه الشبكة" },
          { status: 400 }
        );
      }

      depositAddress = network.depositAddress;
      minDeposit = Number(network.minDeposit || 0);
      maxDeposit = Number(network.maxDeposit || 0);
    }

    minDeposit = Math.max(minDeposit, Number(settings.deposits.minAmount || 0));
    const configuredDepositMaxima = [
      Number(settings.deposits.maxAmount || 0),
      maxDeposit,
    ].filter((value) => value > 0);
    const effectiveMaxDeposit = configuredDepositMaxima.length
      ? Math.min(...configuredDepositMaxima)
      : 0;

    if (amount < minDeposit) {
      return NextResponse.json(
        { success: false, message: "الحد الأدنى للإيداع هو " + minDeposit, minDeposit, maxDeposit: effectiveMaxDeposit },
        { status: 400 }
      );
    }

    if (effectiveMaxDeposit > 0 && amount > effectiveMaxDeposit) {
      return NextResponse.json(
        { success: false, message: "الحد الأقصى للإيداع هو " + effectiveMaxDeposit, minDeposit, maxDeposit: effectiveMaxDeposit },
        { status: 400 }
      );
    }

    const screenshotData = Buffer.from(await screenshot.arrayBuffer());

    const deposit = await DepositRequest.create({
      userId: user._id,
      asset: assetCode,
      network: networkCode,
      amount,
      txHash,
      address: depositAddress,
      status: "pending",
      screenshotData,
      screenshotContentType: screenshot.type,
      screenshotStorage: "mongodb",
      hasScreenshot: true,
    });

    // Notifications are ancillary: never turn a stored deposit request into a false failure.
    try {
      const admins = await User.find({
        role: "admin_leader",
        isActive: true,
      }).select("_id").lean();

      const notifications = [
        {
          userId: user._id,
          type: "deposit" as const,
          title: "تم إنشاء طلب إيداع",
          message: `تم تسجيل طلب إيداع ${amount} ${assetCode} على شبكة ${networkCode} وهو قيد المراجعة.`,
          read: false,
        },
        ...admins.map((admin: any) => ({
          userId: admin._id,
          type: "deposit" as const,
          title: "طلب إيداع جديد",
          message: `وصل طلب إيداع جديد بقيمة ${amount} ${assetCode} على شبكة ${networkCode} من ${String(user.email || user.username || user._id)}. افتح مراجعة الإيداعات لاتخاذ القرار.`,
          read: false,
        })),
      ];

      await Notification.insertMany(notifications);
    } catch (notificationError) {
      console.error("DEPOSIT REQUEST NOTIFICATION ERROR:", notificationError);
    }

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