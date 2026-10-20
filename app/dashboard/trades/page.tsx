"use client";

import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";

type Trade = {
  _id: string;
  symbol: string;
  price: number;
  quantity: number;
  quoteAmount: number;
  createdAt?: string;
  buyerId: string;
  sellerId: string;
  side?: "buy" | "sell";
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(Number(value) || 0);
}

function formatDate(value?: string) {
  if (!value) return "-";

  return new Date(value).toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");

    try {
      const query = symbol.trim()
        ? `?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}`
        : "";

      const res = await fetch(`/api/trades${query}`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "تعذر تحميل سجل التداول");
      }

      setTrades(Array.isArray(data.trades) ? data.trades : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => {
      void load(true);
    }, 10000);
    return () => window.clearInterval(refreshTimer);
  }, [load]);

  return (
    <div
      className="min-h-screen bg-[#050a13] text-white"
      dir="rtl"
    >
      <InternalNavbar />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1700px]">
        <InternalSidebar />

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-[1500px]">

            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">
                  التداول الفوري / سجل التداول
                </div>

                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  سجل التداول
                </h1>

                <p className="mt-2 text-sm text-slate-400">
                  جميع الصفقات التي تم تنفيذها فعليًا على حسابك.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/protrade"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  العودة للتداول الفوري
                </Link>
                <button
                  onClick={() => load()}
                  disabled={loading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  <RefreshCw
                    size={16}
                    className={loading ? "animate-spin" : ""}
                  />
                  تحديث
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-4">
                <div className="text-xs text-slate-500">
                  إجمالي الصفقات
                </div>

                <div className="mt-2 text-xl font-bold">
                  {trades.length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-4">
                <div className="text-xs text-slate-500">
                  إجمالي الكمية
                </div>

                <div className="mt-2 text-xl font-bold">
                  {formatNumber(
                    trades.reduce(
                      (sum, trade) => sum + Number(trade.quantity || 0),
                      0
                    )
                  )}
                </div>
              </div>

              <div className="col-span-2 rounded-2xl border border-white/10 bg-[#07101d] p-4 md:col-span-1">
                <div className="text-xs text-slate-500">
                  إجمالي قيمة التداول
                </div>

                <div className="mt-2 text-xl font-bold">
                  {formatNumber(
                    trades.reduce(
                      (sum, trade) =>
                        sum + Number(trade.quoteAmount || 0),
                      0
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="mb-5 rounded-2xl border border-white/10 bg-[#07101d] p-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    size={17}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                  />

                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") load();
                    }}
                    placeholder="ابحث عن زوج تداول مثل BTCUSDT"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.025] pr-11 pl-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-white/20"
                  />
                </div>

                <button
                  onClick={load}
                  disabled={loading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:opacity-50"
                >
                  <Search size={16} />
                  بحث
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Trades table */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">
              <div className="border-b border-white/5 px-5 py-4">
                <h2 className="text-sm font-semibold">
                  الصفقات المنفذة
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-right text-sm">
                  <thead className="bg-white/[0.025] text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-medium">
                        الزوج
                      </th>

                      <th className="px-5 py-4 font-medium">
                        نوع العملية
                      </th>

                      <th className="px-5 py-4 font-medium">
                        سعر التنفيذ
                      </th>

                      <th className="px-5 py-4 font-medium">
                        الكمية
                      </th>

                      <th className="px-5 py-4 font-medium">
                        قيمة الصفقة
                      </th>

                      <th className="px-5 py-4 font-medium">
                        التاريخ
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/5">
                    {trades.map((trade) => (
                      <tr
                        key={trade._id}
                        className="transition hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-4">
                          <span className="font-semibold text-white">
                            {trade.symbol}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span className={trade.side === "buy" ? "rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400" : trade.side === "sell" ? "rounded-md bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400" : "text-xs text-slate-500"}>
                            {trade.side === "buy" ? "شراء" : trade.side === "sell" ? "بيع" : "—"}
                          </span>
                        </td>

                        <td className="px-5 py-4 font-mono text-slate-200">
                          {formatNumber(trade.price)}
                        </td>

                        <td className="px-5 py-4 font-mono text-slate-300">
                          {formatNumber(trade.quantity)}
                        </td>

                        <td className="px-5 py-4 font-mono text-slate-300">
                          {formatNumber(trade.quoteAmount)}
                        </td>

                        <td className="px-5 py-4 text-xs text-slate-500">
                          {formatDate(trade.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!loading && trades.length === 0 && (
                <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
                  <div>
                    <div className="mb-2 text-sm font-medium text-slate-300">
                      لا توجد صفقات
                    </div>

                    <div className="text-xs text-slate-600">
                      لم يتم العثور على صفقات منفذة مطابقة للبحث.
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex min-h-[260px] items-center justify-center">
                  <div className="text-sm text-slate-500">
                    جاري تحميل سجل التداول...
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}