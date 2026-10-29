"use client";

import { useCallback, useEffect, useState } from "react";

type QuickTrade = {
  _id: string;
  symbol: string;
  side: "buy" | "sell";
  stakeAmount: number;
  entryPrice: number;
  status: "open" | "closed";
  openedAt: string;
  expiresAt: string;
  closedAt?: string;
};

function amount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export default function QuickTradePanel({ symbol }: { symbol: string }) {
  const [items, setItems] = useState<QuickTrade[]>([]);
  const [now, setNow] = useState(Date.now());
  const [curve, setCurve] = useState<number[]>([52, 57, 49, 61, 55, 66, 59, 64, 53, 58, 48, 55, 45, 51, 42, 47]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/quick-trades", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.trades)) setItems(data.trades);
    } catch {
      // Keep the last saved state visible during a network interruption.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 2500);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const movement = window.setInterval(() => {
      setCurve((previous) => {
        const last = previous[previous.length - 1] ?? 50;
        return [...previous, Math.max(12, Math.min(88, last + (Math.random() - 0.54) * 18))].slice(-32);
      });
    }, 1200);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
      window.clearInterval(movement);
    };
  }, [refresh]);

  const active = items.filter((item) => item.symbol === symbol && item.status === "open");
  const history = items.filter((item) => item.symbol === symbol && item.status === "closed").slice(0, 5);
  const points = curve.map((value, index) => `${(index / Math.max(curve.length - 1, 1)) * 1000},${280 - value * 2.6}`).join(" ");
  const countdown = (expiresAt: string) => {
    const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };

  return (
    <section className="border-t border-white/[0.06] bg-[#07101d] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">صفقات الخمس دقائق</h3>
        <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] text-cyan-300">محاكاة مرئية · رصيد تجريبي</span>
      </div>

      {active.length ? active.map((trade) => (
        <article key={trade._id} className="mb-3 rounded-xl border border-cyan-400/15 bg-[#050a13] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-white">{trade.symbol} · {trade.side === "buy" ? "شراء" : "بيع"}</span>
            <span className="font-mono text-cyan-300">العد التنازلي: {countdown(trade.expiresAt)}</span>
          </div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>مبلغ الصفقة: {amount(trade.stakeAmount)} USDT</span>
            <span className="text-amber-300">مفتوحة</span>
          </div>
          <div className="h-24 overflow-hidden rounded-lg bg-white/[0.02]">
            <svg viewBox="0 0 1000 280" preserveAspectRatio="none" className="h-full w-full" aria-label="رسم متحرك لمحاكاة الصفقة">
              {[70, 140, 210].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="currentColor" strokeOpacity="0.12" />)}
              <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </article>
      )) : <div className="py-3 text-xs text-slate-500">لا توجد صفقة مفتوحة لهذا الزوج حاليًا.</div>}

      {history.length ? (
        <div className="mt-3">
          <div className="mb-2 text-xs font-semibold text-slate-300">سجل التداول — الصفقات المغلقة</div>
          <div className="space-y-2">
            {history.map((trade) => (
              <div key={trade._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.05] px-3 py-2 text-[11px]">
                <span>{trade.symbol} · {trade.side === "buy" ? "شراء" : "بيع"}</span>
                <span className="text-slate-400">{amount(trade.stakeAmount)} USDT</span>
                <span className="text-rose-400">تم إغلاق الصفقة</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
