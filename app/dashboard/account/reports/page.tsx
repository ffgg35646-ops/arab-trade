"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type TradeRow = {
  _id: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  quoteQuantity: number;
  fee: number;
  feeAsset: string;
  createdAt?: string;
};
type ReportData = {
  success?: boolean;
  message?: string;
  period?: string;
  from?: string | null;
  summary?: {
    tradeCount?: number;
    volume?: number;
    buys?: number;
    sells?: number;
    completedOrders?: number;
  };
  feesByAsset?: { asset: string; total: number; count: number }[];
  trades?: TradeRow[];
};
type BalanceRow = {
  asset: string;
  available?: number;
  locked?: number;
  total?: number;
  valueUsd?: number;
  priceUsd?: number;
};
type WalletData = {
  wallet?: {
    totalAccountBalanceUsd?: number;
    totalBalanceUsd?: number;
    balances?: BalanceRow[];
  };
  spot?: { balances?: BalanceRow[] };
  funding?: { balances?: BalanceRow[] };
  depositBalances?: BalanceRow[];
};

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function fmt(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}
function date(value?: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export default function FinancialReportsPage() {
  const [period, setPeriod] = useState("30");
  const [report, setReport] = useState<ReportData>({});
  const [wallet, setWallet] = useState<WalletData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (requestedPeriod = period) => {
    setError("");
    try {
      const [reportRes, walletRes] = await Promise.all([
        fetch("/api/account/reports?period=" + encodeURIComponent(requestedPeriod), { cache: "no-store" }),
        fetch("/api/wallet", { cache: "no-store" }),
      ]);
      const [reportData, walletData] = await Promise.all([reportRes.json(), walletRes.json()]);
      if (!reportRes.ok || !reportData.success) throw new Error(reportData.message || "تعذر تحميل التقارير المالية");
      if (!walletRes.ok || !walletData.success) throw new Error(walletData.message || "تعذر تحميل أرصدة الحساب");
      setReport(reportData);
      setWallet(walletData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حدث خطأ أثناء تحميل التقرير المالي");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(period); }, [load, period]);

  const summary = report.summary || {};
  const fees = report.feesByAsset || [];
  const trades = report.trades || [];
  const rawBalances = [
    ...(wallet.spot?.balances || wallet.wallet?.balances || []),
    ...(wallet.funding?.balances || []),
    ...(wallet.depositBalances || []),
  ];
  const distribution = useMemo(() => {
    const byAsset = new Map<string, { asset: string; amount: number; valueUsd: number; priceUsd: number | null }>();
    for (const balance of rawBalances) {
      const asset = String(balance.asset || "").toUpperCase();
      if (!asset) continue;
      const amount = n(balance.total ?? n(balance.available) + n(balance.locked));
      const current = byAsset.get(asset) || { asset, amount: 0, valueUsd: 0, priceUsd: null };
      current.amount += amount;
      if (balance.valueUsd !== undefined && Number.isFinite(Number(balance.valueUsd))) {
        current.valueUsd += n(balance.valueUsd);
        current.priceUsd = n(balance.priceUsd) > 0 ? n(balance.priceUsd) : null;
      } else if (balance.priceUsd !== undefined) {
        current.valueUsd += amount * n(balance.priceUsd);
        current.priceUsd = n(balance.priceUsd) > 0 ? n(balance.priceUsd) : null;
      }
      byAsset.set(asset, current);
    }
    return Array.from(byAsset.values()).filter((row) => row.amount > 0).map((row) => ({
      ...row,
      percent: row.priceUsd !== null && n(wallet.wallet?.totalAccountBalanceUsd ?? wallet.wallet?.totalBalanceUsd) > 0
        ? (row.valueUsd / n(wallet.wallet?.totalAccountBalanceUsd ?? wallet.wallet?.totalBalanceUsd)) * 100
        : null,
    })).sort((a, b) => b.valueUsd - a.valueUsd);
  }, [rawBalances, wallet.wallet?.totalAccountBalanceUsd, wallet.wallet?.totalBalanceUsd]);

  const totalAccountValue = n(wallet.wallet?.totalAccountBalanceUsd ?? wallet.wallet?.totalBalanceUsd);

  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-4 py-8 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 text-xs font-medium text-cyan-400">الحساب</div>
            <h1 className="text-2xl font-bold">التقارير المالية</h1>
            <p className="mt-2 text-sm text-slate-500">ملخص نشاط التداول والرسوم وتوزيع الأصول حسب بيانات الحساب الفعلية.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-xl border border-white/10 bg-[#07101d] p-1" aria-label="الفترة الزمنية">
              {([["7", "7 أيام"], ["30", "30 يومًا"], ["90", "90 يومًا"], ["all", "الكل"]] as const).map(([value, label]) =>
                <button key={value} onClick={() => setPeriod(value)}
                  className={`rounded-lg px-3 py-2 text-xs transition ${period === value ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                  {label}
                </button>)}
            </div>
            <button onClick={() => void load(period)} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] disabled:opacity-50">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث
            </button>
          </div>
        </div>

        {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><BarChart3 size={17} /> حجم التداول</div>
            <div className="text-2xl font-bold">{loading ? "—" : fmt(n(summary.volume)) + " USDT"}</div>
            <div className="mt-2 text-xs text-slate-600">إجمالي قيمة الصفقات المنفذة خلال الفترة</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><Activity size={17} /> عدد الصفقات</div>
            <div className="text-2xl font-bold">{loading ? "—" : fmt(n(summary.tradeCount), 0)}</div>
            <div className="mt-2 text-xs text-slate-600">من سجل التنفيذ الفعلي خلال الفترة</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><TrendingUp size={17} /> قيمة المشتريات</div>
            <div className="text-2xl font-bold text-emerald-400">{loading ? "—" : fmt(n(summary.buys)) + " USDT"}</div>
            <div className="mt-2 text-xs text-slate-600">مشتريات المستخدم، وليس اتجاه أمر الطرف المقابل</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><TrendingDown size={17} /> عملات الرسوم</div>
            <div className="text-2xl font-bold">{loading ? "—" : fmt(fees.length, 0)}</div>
            <div className="mt-2 text-xs text-slate-600">إجمالي كل عملة معروض بشكل مستقل أدناه</div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
          <section className="rounded-2xl border border-white/10 bg-[#07101d]">
            <div className="border-b border-white/10 p-5">
              <h2 className="font-semibold">نشاط التداول</h2>
              <p className="mt-1 text-xs text-slate-600">آخر 100 صفقة ضمن الفترة المختارة. حجم المؤشرات محسوب من كل الصفقات في الفترة.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-right text-sm">
                <thead className="border-b border-white/5 text-xs text-slate-500"><tr>
                  <th className="px-5 py-4 font-medium">التاريخ</th><th className="px-5 py-4 font-medium">الزوج</th>
                  <th className="px-5 py-4 font-medium">النوع</th><th className="px-5 py-4 font-medium">السعر</th>
                  <th className="px-5 py-4 font-medium">الكمية</th><th className="px-5 py-4 font-medium">القيمة</th>
                  <th className="px-5 py-4 font-medium">الرسوم</th>
                </tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-500"><LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />جاري تحميل التقرير...</td></tr>
                    : trades.length === 0 ? <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-500">لا توجد صفقات خلال الفترة المختارة.</td></tr>
                    : trades.map((trade) => <tr key={trade._id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{date(trade.createdAt)}</td>
                      <td className="px-5 py-4 font-semibold">{trade.symbol}</td>
                      <td className={`px-5 py-4 font-medium ${trade.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>{trade.side === "buy" ? "شراء" : "بيع"}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-slate-300">{fmt(n(trade.price), 8)}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-slate-300">{fmt(n(trade.quantity), 8)}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-slate-300">{fmt(n(trade.quoteQuantity), 8)} USDT</td>
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-slate-400">{fmt(n(trade.fee), 8)} {trade.feeAsset}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/5 px-5 py-3 text-xs text-slate-600">
              الأوامر المكتملة أو المنفذة جزئيًا خلال الفترة: {loading ? "—" : fmt(n(summary.completedOrders), 0)}.
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400"><Wallet size={19} /></div>
                <div><h2 className="font-semibold">توزيع الأصول</h2><p className="text-xs text-slate-600">حسب القيمة السوقية المتاحة</p></div>
              </div>
              <div className="mb-4 text-xl font-bold">{loading ? "—" : fmt(totalAccountValue) + " USDT"}</div>
              {distribution.length === 0 ? <div className="py-8 text-center text-sm text-slate-600">لا توجد أرصدة موجبة مسجلة.</div>
                : <div className="space-y-5">{distribution.slice(0, 10).map((item) => <div key={item.asset}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">{item.asset}</span>
                    <span className="text-left text-slate-500">{item.percent === null ? "السعر غير متاح" : fmt(item.percent, 2) + "%"}</span>
                  </div>
                  {item.percent !== null && <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(Math.max(item.percent, 0), 100)}%` }} /></div>}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>{fmt(item.amount, 8)} {item.asset}</span><span>{item.priceUsd === null ? "لا توجد قيمة سوقية" : fmt(item.valueUsd, 4) + " USDT"}</span>
                  </div>
                </div>)}</div>}
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
              <h2 className="font-semibold">الرسوم حسب العملة</h2>
              <p className="mt-1 text-xs text-slate-600">لا يتم جمع رسوم بعملات مختلفة في رقم إجمالي مضلل.</p>
              {fees.length === 0 ? <div className="py-8 text-center text-sm text-slate-600">{loading ? "" : "لا توجد رسوم مسجلة خلال الفترة."}</div>
                : <div className="mt-4 space-y-3">{fees.map((fee) => <div key={fee.asset} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0">
                  <div><div className="font-semibold">{fee.asset}</div><div className="mt-1 text-xs text-slate-600">{fmt(fee.count, 0)} عملية</div></div>
                  <div className="font-mono">{fmt(fee.total, 8)}</div>
                </div>)}</div>}
            </section>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#07101d] p-5">
          <h2 className="font-semibold">ملخص الحساب خلال الفترة</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-black/10 p-4"><div className="text-xs text-slate-500">قيمة المبيعات</div><div className="mt-2 text-xl font-semibold">{loading ? "—" : fmt(n(summary.sells)) + " USDT"}</div></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-4"><div className="text-xs text-slate-500">الأوامر المكتملة أو المنفذة جزئيًا</div><div className="mt-2 text-xl font-semibold">{loading ? "—" : fmt(n(summary.completedOrders), 0)}</div></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-4"><div className="text-xs text-slate-500">الفترة</div><div className="mt-2 text-xl font-semibold">{period === "all" ? "كل السجل" : period + " يوم"}</div><div className="mt-1 text-xs text-slate-600">{report.from ? "من " + date(report.from) : "منذ أول صفقة مسجلة"}</div></div>
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-600">التقرير يقيس حجم التداول والرسوم والرصيد الحالي؛ لا يعرض صافي الربح والخسارة المحقق وغير المحقق، لذلك لا تعتبر حجم التداول أرباحًا.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
