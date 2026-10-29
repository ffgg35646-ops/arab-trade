"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  Download,
  RefreshCw,
  Search,
  Wallet,

} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type Direction = "in" | "out" | "neutral";
type Entry = {
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
type StatementResponse = {
  success?: boolean;
  message?: string;
  entries?: Entry[];
  hasMore?: boolean;
  limit?: number;
};
type WalletResponse = {
  wallet?: {
    totalAccountBalanceUsd?: number;
    totalBalanceUsd?: number;
  };
};

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number, digits = 8): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function csvCell(value: unknown): string {
  return '"' + String(value ?? "").replaceAll('"', '""') + '"';
}

export default function StatementPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accountValueUsd, setAccountValueUsd] = useState(0);
  const [asset, setAsset] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  const fetchStatement = useCallback(async (before?: string, append = false) => {
    if (append) setLoadingMore(true);
    setError("");

    try {
      const params = new URLSearchParams({ limit: "500" });
      if (before) params.set("before", before);

      const [statementRes, walletRes] = await Promise.all([
        fetch("/api/account/statement?" + params.toString(), { cache: "no-store" }),
        append ? Promise.resolve(null) : fetch("/api/wallet", { cache: "no-store" }),
      ]);

      const data: StatementResponse = await statementRes.json();
      if (!statementRes.ok || !data.success) {
        throw new Error(data.message || "تعذر تحميل كشف الحساب");
      }

      const nextEntries = Array.isArray(data.entries) ? data.entries : [];
      setEntries((current) => {
        if (!append) return nextEntries;
        const seen = new Set(current.map((entry) => entry.id));
        return [...current, ...nextEntries.filter((entry) => !seen.has(entry.id))];
      });
      setHasMore(Boolean(data.hasMore));

      if (walletRes) {
        const walletData: WalletResponse = await walletRes.json();
        if (!walletRes.ok) throw new Error("تعذر تحميل قيمة أصول الحساب");
        setAccountValueUsd(n(walletData.wallet?.totalAccountBalanceUsd ?? walletData.wallet?.totalBalanceUsd));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حدث خطأ أثناء تحميل كشف الحساب");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatement();
  }, [fetchStatement]);

  const assets = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.asset).filter(Boolean))).sort(),
    [entries],
  );
  const kinds = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.type).filter(Boolean))).sort(),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      if (asset !== "ALL" && entry.asset !== asset) return false;
      if (kind !== "ALL" && entry.type !== kind) return false;
      if (query && ![entry.asset, entry.type, entry.detail, entry.status].some((value) =>
        String(value || "").toLocaleLowerCase().includes(query)
      )) return false;
      return true;
    });
  }, [entries, asset, kind, search]);

  const totals = useMemo(() => {
    const incoming = filteredEntries.filter((entry) => entry.direction === "in").length;
    const outgoing = filteredEntries.filter((entry) => entry.direction === "out").length;
    const fees = filteredEntries.filter((entry) => entry.type === "رسوم تداول").length;
    return { count: filteredEntries.length, incoming, outgoing, fees };
  }, [filteredEntries]);

  const exportCsv = () => {
    const header = ["Date", "Type", "Asset", "Amount", "Direction", "Status", "Details", "Source"];
    const rows = filteredEntries.map((entry) => [
      entry.date, entry.type, entry.asset, entry.amount, entry.direction, entry.status, entry.detail, entry.source,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "arabtrade-account-statement.csv";
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  const loadMore = () => {
    const oldest = entries.reduce<string | null>((value, entry) => {
      if (!entry.date) return value;
      if (!value || new Date(entry.date).getTime() < new Date(value).getTime()) return entry.date;
      return value;
    }, null);
    if (oldest) void fetchStatement(oldest, true);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-4 py-8 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 text-xs font-medium text-cyan-400">الحساب</div>
            <h1 className="text-2xl font-bold">كشف الحساب</h1>
            <p className="mt-2 text-sm text-slate-500">
              سجل موحّد لحركات التداول والإيداع والسحب والتحويلات وأرباح الباقات والرسوم.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void fetchStatement()} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] disabled:opacity-50">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث
            </button>
            <button onClick={exportCsv} disabled={filteredEntries.length === 0}
              className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
              <Download size={16} /> تصدير CSV
            </button>
          </div>
        </div>

        {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500"><Wallet size={17} /> قيمة أصول الحساب التقريبية</div>
            <div className="text-2xl font-bold">{loading ? "—" : formatNumber(accountValueUsd, 2) + " USDT"}</div>
            <div className="mt-2 text-xs text-slate-600">محوّلة إلى قيمة تقريبية بالدولار/USDT حسب أسعار السوق المتاحة</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-3 text-sm text-slate-500">الحركات المعروضة</div>
            <div className="text-2xl font-bold">{loading ? "—" : formatNumber(totals.count, 0)}</div>
            <div className="mt-2 text-xs text-slate-600">بعد تطبيق البحث والفلاتر</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-3 text-sm text-slate-500">حركات واردة مكتملة</div>
            <div className="text-2xl font-bold text-emerald-400">{loading ? "—" : formatNumber(totals.incoming, 0)}</div>
            <div className="mt-2 text-xs text-slate-600">عدد الحركات وليس مجموع عملات مختلفة</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-3 text-sm text-slate-500">عدد حركات الرسوم</div>
            <div className="text-2xl font-bold">{loading ? "—" : formatNumber(totals.fees, 0)}</div>
            <div className="mt-2 text-xs text-slate-600">يُعرض مبلغ كل رسوم بعملتها في سجل الحركات</div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#07101d]">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث في كشف الحساب..." aria-label="البحث في كشف الحساب"
                className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-4 pr-10 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400/40" />
            </div>
            <label className="relative">
              <span className="sr-only">تصفية حسب الأصل</span>
              <select value={asset} onChange={(event) => setAsset(event.target.value)}
                className="appearance-none rounded-xl border border-white/10 bg-[#07101d] py-3 pl-10 pr-4 text-sm text-slate-300 outline-none">
                <option value="ALL">كل الأصول</option>{assets.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            </label>
            <label className="relative">
              <span className="sr-only">تصفية حسب نوع الحركة</span>
              <select value={kind} onChange={(event) => setKind(event.target.value)}
                className="appearance-none rounded-xl border border-white/10 bg-[#07101d] py-3 pl-10 pr-4 text-sm text-slate-300 outline-none">
                <option value="ALL">كل العمليات</option>{kinds.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-right text-sm">
              <thead className="border-b border-white/5 bg-white/[0.015] text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">التاريخ</th><th className="px-5 py-4 font-medium">نوع الحركة</th>
                  <th className="px-5 py-4 font-medium">الأصل</th><th className="px-5 py-4 font-medium">المبلغ</th>
                  <th className="px-5 py-4 font-medium">الحالة</th><th className="px-5 py-4 font-medium">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {loading && entries.length === 0 ? <tr aria-hidden="true"><td colSpan={6} className="h-24" /></tr>
                  : filteredEntries.length === 0 ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-500"><Wallet size={22} className="mx-auto mb-3 opacity-60" />لا توجد حركات مطابقة للفلاتر.</td></tr>
                  : filteredEntries.map((entry) => <tr key={entry.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{formatDate(entry.date)}</td>
                    <td className="px-5 py-4 font-medium text-slate-200">
                      <span className="flex items-center gap-2">
                        {entry.direction === "in" ? <ArrowDownToLine size={15} className="text-emerald-400" /> :
                          entry.direction === "out" ? <ArrowUpFromLine size={15} className="text-red-400" /> : null}
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold">{entry.asset}</td>
                    <td className={`whitespace-nowrap px-5 py-4 font-mono ${entry.direction === "in" ? "text-emerald-400" : entry.direction === "out" ? "text-red-400" : "text-slate-300"}`}>
                      {entry.direction === "in" ? "+" : entry.direction === "out" ? "−" : ""}{formatNumber(entry.amount, 8)}
                    </td>
                    <td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1 text-xs ${entry.status === "مكتمل" ? "bg-emerald-400/10 text-emerald-400" : entry.status === "مرفوض" ? "bg-red-400/10 text-red-300" : "bg-amber-400/10 text-amber-300"}`}>{entry.status}</span></td>
                    <td className="max-w-[420px] px-5 py-4 text-xs leading-6 text-slate-500">{entry.detail}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          {hasMore && <div className="border-t border-white/5 p-4 text-center">
            <button onClick={loadMore} disabled={loadingMore || loading}
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
              {loadingMore ? "جاري تحميل المزيد..." : "تحميل حركات أقدم"}
            </button>
          </div>}
          <div className="border-t border-white/5 px-5 py-3 text-xs text-slate-600">
            يعرض الكشف الحركات المسجلة في مصادر الحساب المتاحة؛ الأصول ومبالغها تظهر منفصلة ولا تُجمع كأنها عملة واحدة.
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
