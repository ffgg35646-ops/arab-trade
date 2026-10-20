"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ArrowDown, ArrowUp, BarChart3, RefreshCw, Search, Layers3, Users, Scale } from "lucide-react";

type TradingMode = "futures" | "grid" | "copy" | "margin";
type Pair = {
  symbol: string; baseAsset: string; quoteAsset: string; lastPrice: number;
  priceChangePercent: number; highPrice: number; lowPrice: number;
  quoteVolume: number; tradeCount: number;
};
type MarketResponse = { success?: boolean; updatedAt?: number; quotes?: string[]; pairs?: Pair[]; message?: string };
const config: Record<TradingMode, { title: string; eyebrow: string; description: string; disclaimer: string }> = {
  futures: {
    title: "العقود الآجلة",
    eyebrow: "BINANCE USDⓈ-M FUTURES",
    description: "أسعار فعلية لعقود Binance الدائمة المقومة بـ USDT مع بحث وفرز وتحديث دوري.",
    disclaimer: "هذه شاشة سوق عامة وليست واجهة لإرسال أوامر إلى Binance. تنفيذ العقود داخل عرب تريد غير متاح من هذه الصفحة العامة.",
  },
  grid: {
    title: "شبكات التداول",
    eyebrow: "GRID STRATEGY",
    description: "تابع السوق الحي واحسب نطاقًا ومستويات سعرية لاستراتيجية الشبكة قبل إعداد أي بوت.",
    disclaimer: "حاسبة الشبكة تقديرية داخل المتصفح فقط. لا يتم تشغيل بوت أو إنشاء أوامر أو ضمان عائد من هذه الصفحة.",
  },
  copy: {
    title: "نسخ التداول",
    eyebrow: "COPY TRADING",
    description: "تابع بيانات السوق العامة قبل استخدام ميزات نسخ التداول المتاحة في الحساب.",
    disclaimer: "لا نعرض متداولين أو نتائج أو نسب أرباح مصطنعة. قائمة المتداولين وأداء النسخ غير معروضين لأن مصدر بيانات موثوق لهم غير موصول بهذه الصفحة.",
  },
  margin: {
    title: "التداول بالهامش",
    eyebrow: "MARGIN MARKETS",
    description: "استعرض الأسعار المرجعية لأزواج Spot قبل إدارة مراكز الهامش من مساحة الحساب الداخلية.",
    disclaimer: "الهامش والرافعة قد يضاعفان الخسائر. فتح المراكز وإغلاقها يتطلبان تسجيل الدخول والتحقق من الهوية والرصيد المتاح، ويتم ذلك داخل الحساب فقط.",
  },
};
const tabs = [
  { href: "/trading/spot", label: "الفوري" },
  { href: "/trading/futures", label: "العقود الآجلة" },
  { href: "/trading/grid", label: "الشبكات" },
  { href: "/trading/copy", label: "نسخ التداول" },
  { href: "/trading/margin", label: "الهامش" },
];
function fmt(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 1000 ? 2 : value >= 1 ? 6 : 10 });
}
function compact(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value) : "—";
}
export default function PublicTradingPage({ mode }: { mode: TradingMode }) {
  const current = config[mode];
  const endpoint = mode === "futures" ? "/api/market/futures" : "/api/market/binance";
  const Icon = mode === "grid" ? Layers3 : mode === "copy" ? Users : mode === "margin" ? Scale : BarChart3;
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [quotes, setQuotes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState("ALL");
  const [sort, setSort] = useState<"volume" | "gainers" | "losers" | "alphabetical">("volume");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [low, setLow] = useState("60000");
  const [high, setHigh] = useState("70000");
  const [levels, setLevels] = useState(10);
  const pageSize = 40;

  useEffect(() => {
    let active = true;
    const load = async (manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const data: MarketResponse = await response.json();
        if (!response.ok || !data.success || !Array.isArray(data.pairs)) throw new Error(data.message || "تعذر تحميل بيانات السوق.");
        if (!active) return;
        setPairs(data.pairs);
        setQuotes(Array.isArray(data.quotes) ? data.quotes : []);
        setUpdatedAt(Number(data.updatedAt) || Date.now());
        setError("");
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "تعذر تحميل بيانات السوق.");
      } finally {
        if (active) { setLoading(false); setRefreshing(false); }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [endpoint]);

  const filtered = useMemo(() => {
    const term = search.trim().toUpperCase();
    return pairs.filter((p) => (quote === "ALL" || p.quoteAsset === quote) &&
      (!term || p.symbol.includes(term) || p.baseAsset.includes(term) || p.quoteAsset.includes(term)))
      .sort((a, b) => sort === "volume" ? b.quoteVolume-a.quoteVolume :
        sort === "gainers" ? b.priceChangePercent-a.priceChangePercent :
        sort === "losers" ? a.priceChangePercent-b.priceChangePercent : a.symbol.localeCompare(b.symbol));
  }, [pairs, search, quote, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const gainers = pairs.filter((p) => p.priceChangePercent > 0).length;
  const lowNum = Number(low), highNum = Number(high);
  const gridValid = Number.isFinite(lowNum) && Number.isFinite(highNum) && lowNum > 0 && highNum > lowNum && levels >= 2;
  const step = gridValid ? (highNum-lowNum)/(levels-1) : 0;
  useEffect(() => { setPage(1); }, [search, quote, sort]);

  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#050a13] text-white">
      <Navbar />
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-cyan-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />{current.eyebrow}</div>
              <h1 className="text-3xl font-black sm:text-4xl">{current.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{current.description}</p>
            </div>
            <div className="flex gap-2"><Link href="/login" className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-white/5">دخول الحساب</Link><Link href="/register" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500">إنشاء حساب</Link></div>
          </div>
          <nav aria-label="صفحات التداول العامة" className="mb-6 flex flex-wrap gap-2">
            {tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={tab.href === "/trading/"+mode ? "page" : undefined} className={"rounded-xl border px-4 py-2.5 text-xs font-bold "+(tab.href === "/trading/"+mode ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:bg-white/5 hover:text-white")}>{tab.label}</Link>)}
          </nav>
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><div className="text-xs text-slate-400">{mode === "futures" ? "عقود USDT الدائمة" : "أزواج Spot النشطة"}</div><div className="mt-2 text-2xl font-black">{pairs.length.toLocaleString("en-US")}</div></div>
            <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><div className="text-xs text-slate-400">أزواج مرتفعة خلال 24 ساعة</div><div className="mt-2 text-2xl font-black text-emerald-400">{gainers.toLocaleString("en-US")}</div></div>
            <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><div className="text-xs text-slate-400">توقيت آخر تحديث</div><div className="mt-2 text-base font-bold">{updatedAt ? new Date(updatedAt).toLocaleTimeString("ar-EG") : "بانتظار السوق"}</div><button type="button" disabled={refreshing} onClick={() => { setRefreshing(true); fetch(endpoint,{cache:"no-store"}).then(async r=>{const d:MarketResponse=await r.json();if(!r.ok||!d.success||!Array.isArray(d.pairs))throw new Error(d.message||"تعذر التحديث");setPairs(d.pairs);setQuotes(Array.isArray(d.quotes)?d.quotes:[]);setUpdatedAt(Number(d.updatedAt)||Date.now());setError("");}).catch(e=>setError(e instanceof Error?e.message:"تعذر التحديث")).finally(()=>setRefreshing(false)); }} className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-cyan-300 disabled:opacity-50"><RefreshCw size={14} className={refreshing?"animate-spin":""}/> تحديث الآن</button></div>
          </section>
          {mode === "grid" ? <section className="mb-6 rounded-2xl border border-white/10 bg-[#07101d] p-5"><div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300"><Icon size={20}/></div><div><h2 className="font-bold">حاسبة نطاق الشبكة</h2><p className="mt-1 text-xs text-slate-500">حساب تقديري ولا ينشئ أوامر أو يشغّل بوتًا.</p></div></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs text-slate-400">أقل سعر<input inputMode="decimal" value={low} onChange={e=>setLow(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 py-3 text-sm text-white"/></label><label className="text-xs text-slate-400">أعلى سعر<input inputMode="decimal" value={high} onChange={e=>setHigh(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 py-3 text-sm text-white"/></label><label className="text-xs text-slate-400">مستويات الشبكة<select value={levels} onChange={e=>setLevels(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 py-3 text-sm text-white">{[2,3,4,5,6,8,10,12,15,20,25,30,40,50].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div><div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">{gridValid?<div className="grid gap-3 sm:grid-cols-3"><div><div className="text-xs text-slate-500">المسافة بين المستويات</div><div className="mt-1 font-mono text-lg text-cyan-300">{fmt(step)}</div></div><div><div className="text-xs text-slate-500">النطاق</div><div className="mt-1 font-mono text-lg">{fmt(lowNum)} – {fmt(highNum)}</div></div><div><div className="text-xs text-slate-500">الحالة</div><div className="mt-1 text-sm font-bold text-emerald-400">حساب صالح · دون تنفيذ</div></div></div>:<p className="text-sm text-amber-300">أدخل نطاقًا صحيحًا بحيث يكون أعلى سعر أكبر من أقل سعر.</p>}</div></section> :
            <section className="mb-6 grid gap-3 md:grid-cols-3"><article className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><Icon className="mb-3 text-cyan-300" size={20}/><h2 className="font-bold">بيانات سوق فعلية</h2><p className="mt-2 text-sm leading-6 text-slate-400">آخر سعر، والتغير خلال 24 ساعة، والحجم من مصدر بيانات السوق العام.</p></article><article className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><ShieldCheckIcon/><h2 className="font-bold">فصل بيانات العرض والتنفيذ</h2><p className="mt-2 text-sm leading-6 text-slate-400">عرض السعر لا يعني وجود أمر أو صفقة منفذة داخل عرب تريد.</p></article><article className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><RefreshCw className="mb-3 text-cyan-300" size={20}/><h2 className="font-bold">تحديث تلقائي</h2><p className="mt-2 text-sm leading-6 text-slate-400">يتم تحديث بيانات الجدول دوريًا مع إمكانية التحديث اليدوي.</p></article></section>}
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">
            <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-bold">السوق المباشر</h2><p className="mt-1 text-xs text-slate-500">{mode==="futures"?"Binance USDⓈ-M Futures":"Binance Spot"} · بيانات عامة</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative block"><Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن زوج أو عملة" className="w-full rounded-xl border border-white/10 bg-[#050a13] py-3 pr-9 pl-3 text-sm outline-none focus:border-cyan-400/40 sm:w-64"/></label><select aria-label="فلترة عملة التسعير" value={quote} onChange={e=>setQuote(e.target.value)} className="rounded-xl border border-white/10 bg-[#050a13] px-3 py-3 text-sm text-white"><option value="ALL">كل عملات التسعير</option>{quotes.map(q=><option key={q} value={q}>{q}</option>)}</select><select aria-label="ترتيب السوق" value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="rounded-xl border border-white/10 bg-[#050a13] px-3 py-3 text-sm text-white"><option value="volume">الأكثر تداولًا</option><option value="gainers">الأكثر ارتفاعًا</option><option value="losers">الأكثر انخفاضًا</option><option value="alphabetical">أبجدي</option></select></div></div>
            {error?<div role="alert" className="border-b border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">{error} <button type="button" onClick={()=>window.location.reload()} className="mr-2 underline">إعادة المحاولة</button></div>:null}
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-white/5 text-xs text-slate-400"><tr><th className="px-4 py-4 text-right">الزوج</th><th className="px-4 py-4 text-left">آخر سعر</th><th className="px-4 py-4 text-left">التغير 24س</th><th className="px-4 py-4 text-left">أعلى سعر</th><th className="px-4 py-4 text-left">أدنى سعر</th><th className="px-4 py-4 text-left">الحجم</th></tr></thead><tbody>{loading&&pairs.length===0?[1,2,3,4,5].map(n=><tr key={n}><td colSpan={6} className="px-4 py-4"><div className="h-5 animate-pulse rounded bg-white/5"/></td></tr>):visible.length===0?<tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">{error?"تعذر عرض بيانات السوق الآن.":"لا توجد نتائج تطابق البحث."}</td></tr>:visible.map(p=><tr key={p.symbol} className="border-b border-white/5 hover:bg-cyan-400/[0.035]"><td className="px-4 py-4"><b>{p.baseAsset}</b><span className="text-slate-500">/{p.quoteAsset}</span><div className="mt-1 text-[10px] text-slate-600">{p.symbol} · {p.tradeCount.toLocaleString("en-US")} صفقة/24س</div></td><td className="px-4 py-4 text-left font-mono">{fmt(p.lastPrice)}</td><td className={"px-4 py-4 text-left font-mono font-bold "+(p.priceChangePercent>=0?"text-emerald-400":"text-red-400")}><span className="inline-flex items-center gap-1">{p.priceChangePercent>=0?<ArrowUp size={13}/>:<ArrowDown size={13}/>} {p.priceChangePercent>0?"+":""}{p.priceChangePercent.toFixed(2)}%</span></td><td className="px-4 py-4 text-left font-mono">{fmt(p.highPrice)}</td><td className="px-4 py-4 text-left font-mono">{fmt(p.lowPrice)}</td><td className="px-4 py-4 text-left font-mono">{compact(p.quoteVolume)} {p.quoteAsset}</td></tr>)}</tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-4"><span className="text-xs text-slate-500">عدد النتائج: {filtered.length.toLocaleString("en-US")} · صفحة {Math.min(page,pages)} من {pages}</span><div className="flex gap-2"><button type="button" disabled={page<=1} onClick={()=>setPage(v=>Math.max(1,v-1))} className="rounded-lg border border-white/10 px-4 py-2 text-xs disabled:opacity-30">السابق</button><button type="button" disabled={page>=pages} onClick={()=>setPage(v=>Math.min(pages,v+1))} className="rounded-lg border border-white/10 px-4 py-2 text-xs disabled:opacity-30">التالي</button></div></div>
          </section>
          <aside className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-4 text-xs leading-6 text-amber-100/80">{current.disclaimer}</aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
function ShieldCheckIcon() { return <span className="mb-3 inline-flex text-cyan-300"><BarChart3 size={20}/></span>; }
