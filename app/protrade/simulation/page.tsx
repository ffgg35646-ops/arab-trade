"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, Clock3, TrendingDown } from "lucide-react";

type DemoOrder = {
  id: number;
  side: "buy" | "sell";
  symbol: string;
  amount: number;
  startedAt: number;
  status: "open" | "closed";
};

const DURATION_MS = 5 * 60 * 1000;

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function makePath(values: number[]) {
  if (values.length < 2) return "";
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 1000;
      const y = 18 + ((100 - value) / 100) * 220;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export default function SimulatedOrderPreviewPage() {
  const [amountInput, setAmountInput] = useState("100");
  const [activeOrder, setActiveOrder] = useState<DemoOrder | null>(null);
  const [history, setHistory] = useState<DemoOrder[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== "open") return;
    if (now - activeOrder.startedAt < DURATION_MS) return;

    const closed = { ...activeOrder, status: "closed" as const };
    setHistory((previous) => [closed, ...previous]);
    setActiveOrder(null);
  }, [activeOrder, now]);

  const elapsed = activeOrder ? Math.min(DURATION_MS, Math.max(0, now - activeOrder.startedAt)) : 0;
  const remainingSeconds = Math.max(0, Math.ceil((DURATION_MS - elapsed) / 1000));
  const progress = activeOrder ? elapsed / DURATION_MS : 0;

  const chartValues = useMemo(() => {
    const points = Array.from({ length: 44 }, (_, index) => {
      const t = index / 43;
      // A moving demo trace with a downward finish; it does not represent market prices.
      const wiggle = Math.sin(t * 31) * 7 + Math.sin(t * 11 + 1.2) * 9;
      const downward = 88 - t * 73;
      return Math.max(0, Math.min(100, downward + wiggle * (1 - t * 0.55)));
    });
    if (activeOrder) {
      const visibleCount = Math.max(2, Math.ceil(progress * (points.length - 1)) + 1);
      const visible = points.slice(0, visibleCount);
      if (progress > 0.88) {
        const finish = Math.min(visible.length, Math.ceil((progress - 0.88) / 0.12 * visible.length));
        for (let index = Math.max(0, visible.length - finish); index < visible.length; index += 1) {
          const ratio = (index - (visible.length - finish)) / Math.max(1, finish - 1);
          visible[index] = Math.max(0, visible[index] * (1 - ratio));
        }
      }
      return visible;
    }
    return points;
  }, [activeOrder, progress]);

  function startOrder(side: "buy" | "sell") {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0 || activeOrder) return;
    setActiveOrder({
      id: Date.now(),
      side,
      symbol: "BTC/USDT",
      amount,
      startedAt: Date.now(),
      status: "open",
    });
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#070b13] px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-xs text-cyan-300">EQUITI TRADING · ORDER FLOW</p>
            <h1 className="text-2xl font-bold sm:text-3xl">معاينة أمر تداول لمدة 5 دقائق</h1>
            <p className="mt-2 text-sm text-slate-400">واجهة تجريبية مستقلة لعرض حركة الأمر والعدّاد وسجل الإغلاق.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
            <Activity size={16} className="text-cyan-300" />
            <span>وضع المعاينة</span>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.55fr_0.85fr]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-4">
              <div>
                <div className="text-lg font-semibold">BTC/USDT</div>
                <div className="mt-1 text-xs text-slate-500">مخطط حركة تجريبي</div>
              </div>
              <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
                <TrendingDown className="ml-1 inline" size={14} />
                مسار هابط في نهاية المدة
              </div>
            </div>

            <div className="relative h-64 bg-[#080e18] p-3 sm:h-80">
              <svg viewBox="0 0 1000 260" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="خط حركة تجريبي متغير ينتهي عند الصفر">
                {[0, 1, 2, 3, 4].map((row) => (
                  <line key={row} x1="0" x2="1000" y1={row * 60 + 10} y2={row * 60 + 10} stroke="#94a3b8" strokeOpacity="0.14" strokeDasharray="5 8" />
                ))}
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((col) => (
                  <line key={col} x1={col * 125} x2={col * 125} y1="0" y2="260" stroke="#94a3b8" strokeOpacity="0.10" />
                ))}
                <path d={makePath(chartValues)} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {chartValues.length > 0 && (
                  <circle
                    cx={((chartValues.length - 1) / 43) * 1000}
                    cy={18 + ((100 - chartValues[chartValues.length - 1]) / 100) * 220}
                    r="7"
                    fill="#fb7185"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                )}
              </svg>
              <div className="absolute bottom-3 right-4 left-4 flex justify-between text-[10px] text-slate-500">
                <span>بداية الأمر</span><span>نهاية المدة</span>
              </div>
            </div>

            {activeOrder ? (
              <div className="grid grid-cols-3 gap-2 border-t border-white/[0.07] p-4">
                <div className="rounded-xl bg-white/[0.035] p-3">
                  <div className="text-[11px] text-slate-500">حالة الأمر</div>
                  <div className="mt-1 text-sm font-semibold text-emerald-300">مفتوح</div>
                </div>
                <div className="rounded-xl bg-white/[0.035] p-3">
                  <div className="text-[11px] text-slate-500">الوقت المتبقي</div>
                  <div className="mt-1 font-mono text-lg font-bold">{String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}</div>
                </div>
                <div className="rounded-xl bg-white/[0.035] p-3">
                  <div className="text-[11px] text-slate-500">قيمة الأمر</div>
                  <div className="mt-1 text-sm font-semibold">{money(activeOrder.amount)} USDT</div>
                </div>
              </div>
            ) : (
              <div className="border-t border-white/[0.07] p-4 text-sm text-slate-400">ابدأ أمرًا تجريبيًا لتشاهد العدّاد وهو يتحرك حتى الإغلاق.</div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
              <h2 className="text-base font-semibold">فتح أمر تجريبي</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">اختَر القيمة ثم اضغط شراء أو بيع لبدء عدّاد الخمس دقائق.</p>
              <label className="mt-5 block text-xs text-slate-400">قيمة الأمر (USDT)</label>
              <input
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                inputMode="decimal"
                disabled={Boolean(activeOrder)}
                className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#070b13] px-3 text-left font-mono outline-none focus:border-cyan-300/60 disabled:opacity-50"
              />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => startOrder("buy")} disabled={Boolean(activeOrder)} className="rounded-xl bg-emerald-400 px-3 py-3 text-sm font-bold text-[#04120d] transition hover:bg-emerald-300 disabled:opacity-40">شراء</button>
                <button type="button" onClick={() => startOrder("sell")} disabled={Boolean(activeOrder)} className="rounded-xl bg-rose-500 px-3 py-3 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-40">بيع</button>
              </div>
              {activeOrder && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] p-3 text-xs text-cyan-100">
                  <Clock3 size={16} />
                  الأمر جارٍ. سيُغلق بعد انتهاء العدّاد.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
              <div className="mb-3 flex items-center gap-2">
                <ArrowDownRight size={17} className="text-rose-300" />
                <h2 className="font-semibold">سجل الأوامر</h2>
              </div>
              {activeOrder && (
                <div className="mb-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{activeOrder.symbol}</span>
                    <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">مفتوح</span>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-slate-400"><span>{activeOrder.side === "buy" ? "شراء" : "بيع"}</span><span>{money(activeOrder.amount)} USDT</span></div>
                </div>
              )}
              {history.map((order) => (
                <div key={order.id} className="mb-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{order.symbol}</span>
                    <span className="rounded-md bg-rose-400/10 px-2 py-1 text-[10px] text-rose-300">مغلق · خسارة</span>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-slate-400"><span>{order.side === "buy" ? "شراء" : "بيع"}</span><span>-{money(order.amount)} USDT</span></div>
                </div>
              ))}
              {!activeOrder && history.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">لا توجد أوامر بعد.</div>}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
