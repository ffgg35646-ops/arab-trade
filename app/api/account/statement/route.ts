import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import DepositRequest from "@/models/DepositRequest";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Transfer from "@/models/Transfer";
import PackageLedger from "@/models/PackageLedger";
import ReferralCommission from "@/models/ReferralCommission";
import LedgerEntry from "@/models/LedgerEntry";
import Trade from "@/models/Trade";

type Direction = "in" | "out" | "neutral";
type StatementEntry = {
  id: string;
  date: string;
  type: string;
  asset: string;
  amount: number;
  direction: Direction;
  status: string;
  detail: string;
  source: string;
};

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(status: unknown): string {
  switch (String(status || "").toLowerCase()) {
    case "approved":
    case "completed":
    case "paid":
    case "available":
    case "claimed":
      return "مكتمل";
    case "pending":
      return "قيد المراجعة";
    case "rejected":
    case "failed":
      return "مرفوض";
    case "expired":
      return "منتهي";
    default:
      return String(status || "مسجل");
  }
}

function splitSymbol(symbol: string): { base: string; quote: string } {
  const value = String(symbol || "").trim().toUpperCase();
  const knownQuotes = ["USDT", "USDC", "FDUSD", "TUSD", "BTC", "ETH", "BNB"];
  const quote = knownQuotes.find((item) => value.endsWith(item) && value.length > item.length) || "";
  return quote
    ? { base: value.slice(0, -quote.length), quote }
    : { base: value, quote: "—" };
}

function signedDirection(amount: number): Direction {
  if (amount > 0) return "in";
  if (amount < 0) return "out";
  return "neutral";
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
    }

    await connectDB();

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 5000);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 5000, 1), 5000);
    const beforeRaw = url.searchParams.get("before");
    const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
    const beforeFilter = beforeDate && Number.isFinite(beforeDate.getTime())
      ? { createdAt: { $lt: beforeDate } }
      : {};

    const [
      deposits,
      withdrawals,
      transfers,
      packageRows,
      commissions,
      ledgerRows,
      tradeRows,
    ] = await Promise.all([
      DepositRequest.find({ userId: user._id, ...beforeFilter })
        .select("asset network amount status adminNote txHash createdAt creditedAt")
        .sort({ createdAt: -1 }).limit(limit).lean(),
      WithdrawalRequest.find({ userId: user._id, ...beforeFilter })
        .select("type packageId amount asset network payoutAddress status createdAt reviewedAt")
        .sort({ createdAt: -1 }).limit(limit).lean(),
      Transfer.find({ userId: user._id, status: "completed", ...beforeFilter })
        .select("asset amount from to status createdAt")
        .sort({ createdAt: -1 }).limit(limit).lean(),
      PackageLedger.find({ userId: user._id, ...beforeFilter })
        .populate("userPackageId", "packageName")
        .sort({ createdAt: -1 }).limit(limit).lean(),
      ReferralCommission.find({ referrerId: user._id, ...beforeFilter })
        .select("amount asset status rate referredUserId tradeId createdAt")
        .sort({ createdAt: -1 }).limit(limit).lean(),
      LedgerEntry.find({
        userId: user._id,
        mode: "live",
        scope: "user",
        ...beforeFilter,
      }).sort({ createdAt: -1 }).limit(limit).lean(),
      Trade.find({
        mode: "live",
        $or: [{ buyerId: user._id }, { sellerId: user._id }],
        ...beforeFilter,
      }).sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    const entries: StatementEntry[] = [];

    for (const row of deposits as any[]) {
      const approved = String(row.status) === "approved";
      entries.push({
        id: "deposit-" + String(row._id),
        date: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        type: "إيداع",
        asset: String(row.asset || "USDT").toUpperCase(),
        amount: Math.abs(number(row.amount)),
        direction: approved ? "in" : "neutral",
        status: statusLabel(row.status),
        detail: "طلب إيداع عبر " + String(row.network || "شبكة غير محددة") +
          (row.txHash ? " — رقم المعاملة: " + String(row.txHash) : "") +
          (row.adminNote ? " — ملاحظة: " + String(row.adminNote) : ""),
        source: "deposit",
      });
    }

    for (const row of withdrawals as any[]) {
      const approved = String(row.status) === "approved";
      const rejected = String(row.status) === "rejected";
      entries.push({
        id: "withdrawal-" + String(row._id),
        date: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        type: "سحب",
        asset: String(row.asset || "USDT").toUpperCase(),
        amount: Math.abs(number(row.amount)),
        direction: approved ? "out" : "neutral",
        status: statusLabel(row.status),
        detail: (row.type === "general" ? "سحب عام" : "سحب أرباح باقة") +
          (row.network ? " — " + String(row.network) : "") +
          (rejected ? " — لم يتم خصم المبلغ نهائيًا" : approved ? " — تم اعتماد الطلب" : " — الطلب قيد المراجعة"),
        source: "withdrawal",
      });
    }

    for (const row of transfers as any[]) {
      entries.push({
        id: "transfer-" + String(row._id),
        date: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        type: "تحويل داخلي",
        asset: String(row.asset || "").toUpperCase(),
        amount: Math.abs(number(row.amount)),
        direction: "neutral",
        status: "مكتمل",
        detail: "من " + (row.from === "spot" ? "محفظة التداول" : "محفظة التمويل") +
          " إلى " + (row.to === "spot" ? "محفظة التداول" : "محفظة التمويل"),
        source: "transfer",
      });
    }

    const packageTypeLabels: Record<string, string> = {
      activation: "تفعيل باقة",
      activation_withdrawable: "رصيد تفعيل قابل للسحب",
      realized_earning: "أرباح محققة",
      daily_earning: "ربح يومي",
      reward: "مكافأة باقة",
      cancellation_refund: "استرداد تغيير باقة",
      refund_reclassification: "تسوية استرداد",
    };
    for (const row of packageRows as any[]) {
      const amount = number(row.amount);
      const packageName = String(row.userPackageId?.packageName || "").trim();
      entries.push({
        id: "package-" + String(row._id),
        date: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        type: packageTypeLabels[String(row.type)] || "حركة باقة",
        asset: String(row.asset || "USDT").toUpperCase(),
        amount: Math.abs(amount),
        direction: signedDirection(amount),
        status: "مكتمل",
        detail: (packageName ? "باقة " + packageName + " — " : "") + String(row.note || ""),
        source: "package",
      });
    }

    for (const row of commissions as any[]) {
      const status = String(row.status || "available");
      const amount = Math.abs(number(row.amount));
      entries.push({
        id: "commission-" + String(row._id),
        date: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        type: "عمولة إحالة",
        asset: String(row.asset || "USDT").toUpperCase(),
        amount,
        direction: status === "available" || status === "paid" ? "in" : "neutral",
        status: statusLabel(status),
        detail: "عمولة إحالة بمعدل " + number(row.rate) + "%",
        source: "referral",
      });
    }

    // Source-specific records above are authoritative for deposits, transfers,
    // trades, fees, rewards and referral commissions. Exclude matching generic
    // ledger categories to keep one real-world movement from appearing twice.
    const representedTypes = new Set(["deposit", "transfer", "trade", "fee", "reward", "referral"]);
    for (const row of ledgerRows as any[]) {
      const type = String(row.type || "adjustment");
      const referenceId = String(row.referenceId || "");
      const note = String(row.note || "");
      if (representedTypes.has(type)) continue;
      if (
        referenceId.startsWith("separate-deposit-spend:package-activation:") ||
        (type === "adjustment" && note.startsWith("خصم تفعيل باقة"))
      ) continue;

      const amount = number(row.amount);
      const ledgerTypeLabels: Record<string, string> = {
        adjustment: "تسوية رصيد",
        margin_open: "فتح صفقة هامش",
        margin_close: "إغلاق صفقة هامش",
        margin_interest: "فوائد الهامش",
        margin_liquidation: "تصفية هامش",
        liquidation_fee: "رسوم تصفية",
        insurance_fund_credit: "إيداع صندوق التأمين",
        insurance_fund_debit: "خصم صندوق التأمين",
        bad_debt: "مديونية",
      };
      entries.push({
        id: "ledger-" + String(row._id),
        date: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        type: ledgerTypeLabels[type] || "حركة حساب",
        asset: String(row.asset || "").toUpperCase(),
        amount: Math.abs(amount),
        direction: signedDirection(amount),
        status: "مكتمل",
        detail: String(row.note || "حركة مسجلة في دفتر الحساب"),
        source: "ledger",
      });
    }

    for (const row of tradeRows as any[]) {
      const isBuyer = String(row.buyerId) === String(user._id);
      const side = isBuyer ? "buy" : "sell";
      const { base, quote } = splitSymbol(String(row.symbol || ""));
      const quantity = number(row.quantity);
      const price = number(row.price);
      const quoteAmount = number(row.quoteAmount) || quantity * price;
      const fee = number(isBuyer ? row.feeBuyer : row.feeSeller);
      const feeAsset = String((isBuyer ? row.buyerFeeAsset : row.sellerFeeAsset) || quote).toUpperCase();

      entries.push({
        id: "trade-" + String(row._id),
        date: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        type: side === "buy" ? "شراء" : "بيع",
        asset: quote,
        amount: Math.abs(quoteAmount),
        direction: side === "buy" ? "out" : "in",
        status: "مكتمل",
        detail: (side === "buy" ? "شراء " : "بيع ") + formatQuantity(quantity) + " " + base +
          " بسعر " + formatQuantity(price) + " " + quote,
        source: "trade",
      });

      if (fee > 0) {
        entries.push({
          id: "fee-" + String(row._id),
          date: row.createdAt ? new Date(row.createdAt).toISOString() : "",
          type: "رسوم تداول",
          asset: feeAsset || quote,
          amount: fee,
          direction: "out",
          status: "مكتمل",
          detail: "رسوم الصفقة " + String(row.symbol || ""),
          source: "trade-fee",
        });
      }
    }

    const ordered = entries
      .filter((entry) => entry.date && Number.isFinite(new Date(entry.date).getTime()))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      entries: ordered,
      count: ordered.length,
      limit,
      hasMore: ordered.length === limit,
    });
  } catch (error) {
    console.error("ACCOUNT STATEMENT ERROR:", error);
    return NextResponse.json(
      { success: false, message: "تعذر تحميل كشف الحساب الموحد" },
      { status: 500 }
    );
  }
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
}
