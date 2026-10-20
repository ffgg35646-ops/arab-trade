"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Activity, Bot, CheckCircle2, CircleAlert, Pause, Play, RefreshCw, ShieldAlert, Wallet } from "lucide-react";

type StrategyEvent = {
  kind?: string;
  message?: string;
  price?: number;
  createdAt?: string;
  orderId?: string;
};

type Strategy = {
  _id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  executionMode: "manual" | "bot";
  entryOperator: "at_or_below" | "at_or_above";
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice?: number;
  quoteBudget: number;
  maxCycles: number;
  cyclesCompleted: number;
  positionQuantity: number;
  averageEntryPrice?: number;
  status: "paused" | "running" | "completed" | "error";
  phase: string;
  lastPrice?: number;
  lastSignal?: string;
  lastError?: string;
  lastCheckedAt?: string;
  events?: StrategyEvent[];
  createdAt?: string;
};

const phaseLabel: Record<string, string> = {
  waiting_to_buy: "ينتظر شرط الدخول",
  buy_signal: "إشارة شراء — بانتظار تأكيدك",
  buy_pending: "أمر الشراء ينتظر تأكيد Binance",
  holding: "تم الشراء — ينتظر شرط الخروج",
  sell_signal: "إشارة بيع — بانتظار تأكيدك",
  sell_pending: "أمر البيع ينتظر تأكيد Binance",
};
const statusLabel: Record<string, string> = {
  paused: "متوقف مؤقتًا",
  running: "يراقب السوق",
  completed: "اكتمل",
  error: "خطأ",
};
const knownQuotes = ["FDUSD", "USDT", "USDC", "TUSD", "BTC", "ETH", "BNB", "EUR", "TRY", "BRL"];

function number(value: unknown, digits = 8) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function quoteFromSymbol(value: string) {
  const symbol = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return knownQuotes.find((quote) => symbol.endsWith(quote)) || "USDT";
}

export default function SpotStrategyTerminal() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [executionMode, setExecutionMode] = useState<"manual" | "bot">("manual");
  const [entryOperator, setEntryOperator] = useState<"at_or_below" | "at_or_above">("at_or_below");
  const [entryPrice, setEntryPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [quoteBudget, setQuoteBudget] = useState("25");
  const [maxCycles, setMaxCycles] = useState("1");
  const [marketPrice, setMarketPrice] = useState(0);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const quoteAsset = useMemo(() => quoteFromSymbol(symbol), [symbol]);

  const loadStrategies = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      // Manual strategies only need browser-side checking while this screen is open.
      // The endpoint never submits orders; it only moves manual rules into signal states.
      await fetch("/api/trading-strategies/watch", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      }).catch(() => null);
      const response = await fetch("/api/trading-strategies", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || "تعذر تحميل الاستراتيجيات");
      }
      setStrategies(Array.isArray(data.strategies) ? data.strategies : []);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "تعذر تحميل الاستراتيجيات");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    const loadPrice = async () => {
      try {
        const response = await fetch("/api/trading-strategies/price?symbol=" + encodeURIComponent(symbol), {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        const price = Number(data?.price);
        if (!stopped && response.ok && data?.success !== false && Number.isFinite(price) && price > 0) setMarketPrice(price);
      } catch {
        // Keep the most recent valid price visible when the public market feed is unavailable.
      }
    };
    void loadPrice();
    const timer = window.setInterval(() => void loadPrice(), 10000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [symbol]);

  useEffect(() => {
    void loadStrategies();
    const timer = window.setInterval(() => void loadStrategies(true), 15000);
    return () => window.clearInterval(timer);
  }, [loadStrategies]);

  const createStrategy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/trading-strategies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          executionMode,
          entryOperator,
          entryPrice: Number(entryPrice),
          takeProfitPrice: Number(takeProfitPrice),
          stopLossPrice: stopLossPrice.trim() ? Number(stopLossPrice) : undefined,
          quoteBudget: Number(quoteBudget),
          maxCycles: Number(maxCycles),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || "تعذر إنشاء الاستراتيجية");
      }
      setNotice(data.message || "تم إنشاء الاستراتيجية وهي متوقفة.");
      setEntryPrice("");
      setTakeProfitPrice("");
      setStopLossPrice("");
      await loadStrategies(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إنشاء الاستراتيجية");
    } finally {
      setSubmitting(false);
    }
  };

  const performAction = async (strategy: Strategy, action: "start" | "pause" | "execute-buy" | "execute-sell") => {
    setError("");
    setNotice("");
    if (action === "start" && strategy.executionMode === "bot") {
      const accepted = window.confirm(
        "تنبيه: البوت الآلي سيرسل أوامر شراء وبيع حقيقية إلى Binance باستخدام رصيد التداول المتاح، عند تحقق الشروط المحددة. لا يوجد ضمان للربح وقد يحدث انزلاق سعري. هل تريد تشغيل البوت؟"
      );
      if (!accepted) return;
    }
    setBusyId(strategy._id);
    try {
      const response = await fetch("/api/trading-strategies/" + encodeURIComponent(strategy._id), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || "تعذر تنفيذ الإجراء");
      }
      const messages: Record<string, string> = {
        start: strategy.executionMode === "bot" ? "تم تشغيل البوت. سيتداول فقط عند تحقق شروطه." : "بدأت مراقبة السعر؛ التنفيذ اليدوي يحتاج إلى تأكيدك.",
        pause: "تم إيقاف الاستراتيجية مؤقتًا.",
        "execute-buy": "تم إرسال أمر الشراء إلى Binance؛ انتظر تأكيد الكمية المنفذة.",
        "execute-sell": "تم إرسال أمر البيع إلى Binance؛ انتظر تأكيد الكمية المنفذة.",
      };
      setNotice(messages[action]);
      await loadStrategies(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
    } finally {
      setBusyId("");
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] px-4 pb-16 pt-28 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-cyan-400">
              <Activity size={17} />
              استراتيجيات التداول الفوري
            </div>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">اشترِ عند تحقق شرط، وبِع عند هدفك</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              اضبط سعر الدخول وهدف البيع ووقف الخسارة. اختر إشارات يدوية تؤكدها بنفسك، أو بوتًا ينفّذ أوامر السوق آليًا عند تحقق الشروط.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadStrategies()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
          >
            <RefreshCw size={14} /> تحديث
          </button>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/[0.08] bg-[#07101d] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Activity size={15} /> سعر السوق الحالي · {symbol}</div>
            <div className="mt-2 font-mono text-2xl font-bold">{marketPrice > 0 ? number(marketPrice, 8) : "—"} <span className="text-xs text-slate-500">{quoteAsset}</span></div>
            <p className="mt-2 text-[11px] text-slate-500">السعر من بيئة تنفيذ Binance المختارة، وتتحدث الواجهة دوريًا.</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#07101d] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Bot size={15} /> أسلوب التشغيل</div>
            <p className="mt-2 text-lg font-bold">يدوي أو آلي</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">اليدوي يعطي إشارة للتأكيد. البوت يرسل أوامر حقيقية عند تحقق الشروط.</p>
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-amber-300"><ShieldAlert size={15} /> تنبيه مهم</div>
            <p className="mt-2 text-sm font-bold text-amber-100">لا يوجد ضمان للربح</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">الأسعار قد تتجاوز الهدف أو وقف الخسارة بسرعة، وقد يختلف التنفيذ عن السعر الظاهر. راجع الإعدادات قبل تشغيل البوت.</p>
          </div>
        </div>

        {(error || notice) && (
          <div className={"mb-5 rounded-xl border p-3 text-sm " + (error ? "border-rose-400/20 bg-rose-400/[0.05] text-rose-200" : "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200")}>
            {error || notice}
          </div>
        )}

        <section className="mb-8 rounded-2xl border border-white/[0.08] bg-[#07101d] p-4 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Bot size={20} /></div>
            <div>
              <h2 className="text-lg font-black">إنشاء استراتيجية جديدة</h2>
              <p className="mt-1 text-xs text-slate-500">تُنشأ متوقفة أولًا؛ لن تبدأ قبل ضغط زر التشغيل.</p>
            </div>
          </div>

          <form onSubmit={createStrategy} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-xs text-slate-400">
              زوج التداول
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                required
                minLength={5}
                maxLength={25}
                placeholder="BTCUSDT"
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#050a13] px-3 text-sm text-white outline-none focus:border-cyan-400/60"
              />
              <span className="mt-1 block text-[10px] text-slate-600">اكتب الرمز كما يظهر في Binance، مثل BTCUSDT.</span>
            </label>

            <label className="block text-xs text-slate-400">
              طريقة التنفيذ
              <select
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value === "bot" ? "bot" : "manual")}
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#050a13] px-3 text-sm text-white outline-none focus:border-cyan-400/60"
              >
                <option value="manual">يدوي — إشارة ثم تأكيد</option>
                <option value="bot">بوت آلي — تنفيذ تلقائي</option>
              </select>
            </label>

            <label className="block text-xs text-slate-400">
              شرط سعر الدخول
              <select
                value={entryOperator}
                onChange={(e) => setEntryOperator(e.target.value === "at_or_above" ? "at_or_above" : "at_or_below")}
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#050a13] px-3 text-sm text-white outline-none focus:border-cyan-400/60"
              >
                <option value="at_or_below">اشترِ عند السعر أو أقل (هبوط)</option>
                <option value="at_or_above">اشترِ عند السعر أو أعلى (اختراق صاعد)</option>
              </select>
            </label>

            <label className="block text-xs text-slate-400">
              سعر الدخول ({quoteAsset})
              <input value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} required type="number" min="0.00000001" step="any" placeholder={marketPrice > 0 ? String(marketPrice) : "سعر الدخول"} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#050a13] px-3 text-sm text-white outline-none focus:border-cyan-400/60" />
            </label>

            <label className="block text-xs text-slate-400">
              هدف البيع / جني الربح ({quoteAsset})
              <input value={takeProfitPrice} onChange={(e) => setTakeProfitPrice(e.target.value)} required type="number" min="0.00000001" step="any" placeholder="مثال: 70000" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#050a13] px-3 text-sm text-white outline-none focus:border-cyan-400/60" />
            </label>

            <label className="block text-xs text-slate-400">
              وقف الخسارة — اختياري ({quoteAsset})
              <input value={stopLossPrice} onChange={(e) => setStopLossPrice(e.target.value)} type="number" min="0.00000001" step="any" placeholder="مثال: 62000" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#050a13] px-3 text-sm text-white outline-none focus:border-cyan-400/60" />
            </label>

            <label className="block text-xs text-slate-400">
              ميزانية كل شراء ({quoteAsset})
              <span className="mt-2 flex h-11 items-center rounded-lg border border-white/10 bg-[#050a13] px-3 focus-within:border-cyan-400/60">
                <Wallet size={15} className="ml-2 text-slate-600" />
                <input value={quoteBudget} onChange={(e) => setQuoteBudget(e.target.value)} required type="number" min="0.00000001" step="any" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" />
              </span>
              <span className="mt-1 block text-[10px] text-slate-600">ميزانية الصفقة الواحدة قبل احتساب الرسوم الفعلية.</span>
            </label>

            <label className="block text-xs text-slate-400">
              عدد دورات الشراء والبيع
              <input value={maxCycles} onChange={(e) => setMaxCycles(e.target.value)} required type="number" min="1" max="100" step="1" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#050a13] px-3 text-sm text-white outline-none focus:border-cyan-400/60" />
              <span className="mt-1 block text-[10px] text-slate-600">كل دورة = شراء ثم بيع مؤكد. لا يتكرر الدخول بلا حد.</span>
            </label>

            <div className="flex items-end xl:col-span-4">
              <button type="submit" disabled={submitting} className="h-11 w-full rounded-lg bg-cyan-400 px-5 text-sm font-black text-[#04121c] transition hover:bg-cyan-300 disabled:opacity-50 md:w-auto">
                {submitting ? "جارٍ إنشاء الاستراتيجية..." : "إنشاء الاستراتيجية"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">استراتيجياتي</h2>
            <span className="text-xs text-slate-500">{strategies.length} استراتيجية</span>
          </div>
          {loading ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#07101d] p-6 text-sm text-slate-500">جارٍ تحميل الاستراتيجيات...</div>
          ) : strategies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.12] bg-[#07101d] p-8 text-center">
              <Bot size={28} className="mx-auto text-slate-600" />
              <p className="mt-3 text-sm font-bold text-slate-300">لا توجد استراتيجيات بعد</p>
              <p className="mt-2 text-xs text-slate-500">أنشئ قاعدة دخول وخروج، ثم شغّلها بعد مراجعة الإعدادات.</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {strategies.map((strategy) => (
                <article key={strategy._id} className="rounded-2xl border border-white/[0.08] bg-[#07101d] p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black">{strategy.symbol}</h3>
                        <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-400">{strategy.executionMode === "bot" ? "بوت آلي" : "يدوي بإشارة"}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{phaseLabel[strategy.phase] || strategy.phase}</p>
                    </div>
                    <span className={"rounded-full px-2.5 py-1 text-[10px] " + (strategy.status === "running" ? "bg-emerald-400/10 text-emerald-300" : strategy.status === "completed" ? "bg-cyan-400/10 text-cyan-300" : "bg-slate-400/10 text-slate-400")}>
                      {statusLabel[strategy.status] || strategy.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg bg-black/20 p-3">
                      <div className="text-[10px] text-slate-500">آخر سعر</div>
                      <div className="mt-1 font-mono text-sm">{number(strategy.lastPrice, 8)}</div>
                    </div>
                    <div className="rounded-lg bg-black/20 p-3">
                      <div className="text-[10px] text-slate-500">الدخول</div>
                      <div className="mt-1 font-mono text-sm">{number(strategy.entryPrice, 8)}</div>
                      <div className="mt-1 text-[9px] text-slate-600">{strategy.entryOperator === "at_or_below" ? "عند السعر أو أقل" : "عند السعر أو أعلى"}</div>
                    </div>
                    <div className="rounded-lg bg-black/20 p-3">
                      <div className="text-[10px] text-slate-500">هدف البيع</div>
                      <div className="mt-1 font-mono text-sm text-emerald-300">{number(strategy.takeProfitPrice, 8)}</div>
                    </div>
                    <div className="rounded-lg bg-black/20 p-3">
                      <div className="text-[10px] text-slate-500">وقف الخسارة</div>
                      <div className="mt-1 font-mono text-sm text-rose-300">{strategy.stopLossPrice ? number(strategy.stopLossPrice, 8) : "غير محدد"}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-400">
                    <span>ميزانية الدخول: {number(strategy.quoteBudget, 4)} {strategy.quoteAsset}</span>
                    <span>الكمية الحالية: {number(strategy.positionQuantity, 8)} {strategy.baseAsset}</span>
                    <span>الدورات: {strategy.cyclesCompleted}/{strategy.maxCycles}</span>
                  </div>

                  {strategy.lastSignal ? <p className="mt-3 text-xs text-cyan-200">{strategy.lastSignal}</p> : null}
                  {strategy.lastError ? (
                    <div className="mt-3 flex gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-3 text-xs leading-5 text-rose-200">
                      <CircleAlert size={15} className="mt-0.5 shrink-0" /> {strategy.lastError}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {strategy.status !== "running" && strategy.status !== "completed" ? (
                      <button type="button" disabled={busyId === strategy._id} onClick={() => void performAction(strategy, "start")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-[#03100a] disabled:opacity-50">
                        <Play size={14} /> {busyId === strategy._id ? "جارٍ..." : "تشغيل"}
                      </button>
                    ) : null}
                    {strategy.status === "running" ? (
                      <button type="button" disabled={busyId === strategy._id} onClick={() => void performAction(strategy, "pause")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-50">
                        <Pause size={14} /> إيقاف مؤقت
                      </button>
                    ) : null}
                    {strategy.executionMode === "manual" && strategy.status === "running" && strategy.phase === "buy_signal" ? (
                      <button type="button" disabled={busyId === strategy._id} onClick={() => void performAction(strategy, "execute-buy")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-[#03100a] disabled:opacity-50">
                        <CheckCircle2 size={14} /> تأكيد شراء الآن
                      </button>
                    ) : null}
                    {strategy.executionMode === "manual" && strategy.status === "running" && strategy.phase === "sell_signal" ? (
                      <button type="button" disabled={busyId === strategy._id} onClick={() => void performAction(strategy, "execute-sell")} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-400 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                        <CheckCircle2 size={14} /> تأكيد بيع الآن
                      </button>
                    ) : null}
                  </div>

                  {Array.isArray(strategy.events) && strategy.events.length > 0 ? (
                    <div className="mt-4 border-t border-white/[0.06] pt-3">
                      <div className="mb-2 text-[10px] font-bold text-slate-500">آخر الأحداث</div>
                      <div className="space-y-2">
                        {strategy.events.slice(-3).reverse().map((event, index) => (
                          <div key={String(event.createdAt || index) + "-" + index} className="flex gap-2 text-[10px] leading-5 text-slate-500">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/60" />
                            <span>{event.message}{event.price ? " · " + number(event.price, 8) : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="mt-8 rounded-xl border border-amber-400/15 bg-amber-400/[0.03] p-4 text-xs leading-6 text-slate-400">
          <div className="mb-1 flex items-center gap-2 font-bold text-amber-200"><ShieldAlert size={15} /> متطلبات التشغيل الآلي</div>
          الإشارات اليدوية تُحدّث أثناء فتح هذه الشاشة، ولا ترسل أوامر إلا بعد تأكيدك. البوت الآلي يعمل في الخلفية عبر GitHub Actions كل 5 دقائق ولا يحتاج إلى بقاء المتصفح مفتوحًا؛ لتفعيله اضبط متغير الاستضافة SPOT_STRATEGY_RUNNER_ENABLED=true، ومتغير GitHub Actions ARAB_TRADE_BASE_URL (أصل الموقع HTTPS) والسر CRON_SECRET (بنفس القيمة السرية في الاستضافة). إذا لم تكتمل هذه الإعدادات، سيرفض النظام تشغيل البوت بدل إظهار أنه يعمل وهو غير مهيأ. لا تُشغّل التداول الحقيقي قبل التأكد من مفاتيح Binance وصلاحية Spot Trading ورصيدك المتاح.
        </div>
      </div>
    </main>
  );
}
