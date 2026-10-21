"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BarChart3, RefreshCw, Search } from "lucide-react";
type MarketPair = {
  symbol: string; baseAsset: string; quoteAsset: string; status: string;
  lastPrice: number; priceChangePercent: number; highPrice: number; lowPrice: number;
  baseVolume: number; quoteVolume: number; tradeCount: number;
};
type MarketResponse = { success?: boolean; updatedAt?: number; count?: number; quotes?: string[]; pairs?: MarketPair[]; message?: string };
type SortKey = "volume" | "gainers" | "losers" | "alphabetical";

function price(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 1000 ? 2 : value >= 1 ? 6 : 10 });
}
function compact(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export default function MarketsPage() {
  const [pairs, setPairs] = useState<MarketPair[]>([]);
  const [quotes, setQuotes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("volume");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const pageSize = 100;

  async function loadMarket(manual = false) {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/market/binance", { cache: "no-store" });
      const data: MarketResponse = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.pairs)) {
        throw new Error(data.message || "تعذر تحميل قائمة أزواج Binance.");
      }
      setPairs(data.pairs);
      setQuotes(Array.isArray(data.quotes) ? data.quotes : []);
      setUpdatedAt(Number(data.updatedAt) || Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الأسواق.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await loadMarket();
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const filteredPairs = useMemo(() => {
    const term = search.trim().toUpperCase();
    const result = pairs.filter((item) =>
      (quote === "ALL" || item.quoteAsset === quote) &&
      (!term || item.symbol.includes(term) || item.baseAsset.includes(term) || item.quoteAsset.includes(term))
    );
    result.sort((a, b) => {
      if (sort === "volume") return b.quoteVolume - a.quoteVolume;
      if (sort === "gainers") return b.priceChangePercent - a.priceChangePercent;
      if (sort === "losers") return a.priceChangePercent - b.priceChangePercent;
      return a.symbol.localeCompare(b.symbol);
    });
    return result;
  }, [pairs, search, quote, sort]);

  const stats = useMemo(() => ({
    gainers: pairs.filter((item) => item.priceChangePercent > 0).length,
    quoteCount: quotes.length,
  }), [pairs, quotes]);
  const pages = Math.max(1, Math.ceil(filteredPairs.length / pageSize));
  const visiblePairs = filteredPairs.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, quote, sort]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      
      <div className="mx-auto flex max-w-[1700px]">
        
        <section className="min-w-0 flex-1">
    <main dir="rtl" className="min-h-screen bg-[#050a13] px-3 py-6 text-white sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-cyan-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Binance Spot · بيانات سوق عامة
            </div>
            <h1 className="text-3xl font-black sm:text-4xl">الأسواق</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              قائمة أزواج التداول الفوري المتاحة حاليًا في Binance، مع الأسعار والتغيّر خلال 24 ساعة وحجم التداول. اضغط على أي زوج لفتح صفحة التداول داخل عرب تريد.
            </p>
          </div>
          <button type="button" onClick={() => void loadMarket(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.07]">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> تحديث الأسواق
          </button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><div className="text-xs text-slate-400">أزواج Spot المتاحة</div><div className="mt-2 text-2xl font-black tabular-nums">{pairs.length.toLocaleString("en-US")}</div></div>
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><div className="text-xs text-slate-400">أزواج مرتفعة خلال 24 ساعة</div><div className="mt-2 text-2xl font-black text-emerald-400">{stats.gainers.toLocaleString("en-US")}</div></div>
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><div className="text-xs text-slate-400">عملات التسعير المتاحة</div><div className="mt-2 text-2xl font-black tabular-nums">{stats.quoteCount.toLocaleString("en-US")}</div></div>
        </div>

        {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300"><span>{error}</span><button type="button" onClick={() => void loadMarket(true)} className="rounded-lg border border-red-400/20 px-3 py-2 font-semibold">إعادة المحاولة</button></div>}

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {([["volume", "الأكثر تداولًا"], ["gainers", "الأكثر ارتفاعًا"], ["losers", "الأكثر انخفاضًا"], ["alphabetical", "ترتيب أبجدي"]] as [SortKey, string][]).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setSort(value)} className={"rounded-lg px-3 py-2 text-xs font-bold " + (sort === value ? "bg-cyan-400/10 text-cyan-300" : "text-slate-400 hover:bg-white/5 hover:text-white")}>{label}</button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block"><Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن زوج أو عملة..." className="w-full rounded-xl border border-white/10 bg-[#050a13] py-3 pr-9 pl-3 text-sm outline-none focus:border-cyan-400/40 sm:w-64" /></label>
              <select aria-label="فلترة عملة التسعير" value={quote} onChange={(event) => setQuote(event.target.value)} className="rounded-xl border border-white/10 bg-[#050a13] px-3 py-3 text-sm text-slate-200 outline-none">
                <option value="ALL">كل عملات التسعير</option>{quotes.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3 text-xs text-slate-500"><span>عدد النتائج: {filteredPairs.length.toLocaleString("en-US")}</span><span>{updatedAt ? "آخر تحديث: " + new Date(updatedAt).toLocaleTimeString("ar-EG") : "في انتظار بيانات السوق"}</span></div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-white/5 bg-white/[0.015] text-xs text-slate-400"><tr>
                <th className="px-4 py-4 text-right">زوج التداول</th><th className="px-4 py-4 text-left">آخر سعر</th><th className="px-4 py-4 text-left">التغير 24س</th><th className="px-4 py-4 text-left">أعلى 24س</th><th className="px-4 py-4 text-left">أدنى 24س</th><th className="px-4 py-4 text-left">حجم التداول</th><th className="px-4 py-4 text-left">الإجراء</th>
              </tr></thead>
              <tbody>
                {loading && pairs.length === 0 ? [1,2,3,4,5,6,7].map((item) => <tr key={item} className="border-b border-white/5"><td colSpan={7} className="px-4 py-4"><div className="h-5 animate-pulse rounded bg-white/5" /></td></tr>) :
                visiblePairs.length === 0 ? <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500">{error ? "بيانات السوق غير متاحة الآن." : "لا توجد أزواج تطابق البحث."}</td></tr> :
                visiblePairs.map((item) => <tr key={item.symbol} className="border-b border-white/5 hover:bg-cyan-400/[0.035]">
                  <td className="px-4 py-4"><Link href={"/protrade?symbol=" + item.symbol} className="font-bold text-white hover:text-cyan-300">{item.baseAsset}<span className="text-slate-500">/{item.quoteAsset}</span></Link><div className="mt-1 text-[10px] text-slate-600">Spot · {item.tradeCount.toLocaleString("en-US")} صفقة/24س</div></td>
                  <td className="px-4 py-4 text-left font-mono tabular-nums">{price(item.lastPrice)}</td>
                  <td className={"px-4 py-4 text-left font-mono font-bold " + (item.priceChangePercent >= 0 ? "text-emerald-400" : "text-red-400")}><span className="inline-flex items-center gap-1">{item.priceChangePercent >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{item.priceChangePercent > 0 ? "+" : ""}{item.priceChangePercent.toFixed(2)}%</span></td>
                  <td className="px-4 py-4 text-left font-mono text-slate-300">{price(item.highPrice)}</td><td className="px-4 py-4 text-left font-mono text-slate-300">{price(item.lowPrice)}</td>
                  <td className="px-4 py-4 text-left font-mono text-slate-300">{compact(item.quoteVolume)} <span className="text-[10px] text-slate-600">{item.quoteAsset}</span></td>
                  <td className="px-4 py-4 text-left"><Link href={"/protrade?symbol=" + item.symbol} className="inline-flex items-center gap-1 rounded-lg bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20"><BarChart3 size={14} />تداول</Link></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-4"><span className="text-xs text-slate-500">صفحة {Math.min(page, pages)} من {pages}</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold disabled:opacity-30">السابق</button><button type="button" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold disabled:opacity-30">التالي</button></div></div>
        </section>
        <p className="mt-4 text-xs leading-6 text-slate-600">الأسعار والأحجام المعروضة بيانات سوق عامة من Binance Spot. تنفيذ الأوامر داخل عرب تريد يعتمد على دفتر أوامر المنصة الداخلي، وليس إرسال الأوامر إلى Binance.</p>
      </div>
    </main>
        </section>
      </div>
    </div>
  );
}
