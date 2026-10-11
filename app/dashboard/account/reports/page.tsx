"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type Balance = {
  asset: string;
  free?: number;
  locked?: number;
  total?: number;
};

type Trade = {
  _id?: string;
  id?: string;
  symbol: string;
  side?: "buy" | "sell";
  price?: number;
  quantity?: number;
  quoteQuantity?: number;
  fee?: number;
  createdAt?: string;
};

type Order = {
  symbol: string;
  side: "buy" | "sell";
  status?: string;
  filledQuantity?: number;
  originalQuantity?: number;
  price?: number;
  createdAt?: string;
};

function n(value: unknown) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function fmt(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function date(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
  }).format(d);
}

export default function FinancialReportsPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [walletRes, tradesRes, ordersRes] = await Promise.all([
        fetch("/api/wallet", { cache: "no-store" }),
        fetch("/api/trades?limit=500", { cache: "no-store" }),
        fetch("/api/orders?limit=500", { cache: "no-store" }),
      ]);

      if (!walletRes.ok || !tradesRes.ok || !ordersRes.ok) {
        throw new Error("تعذر تحميل التقارير المالية");
      }

      const wallet = await walletRes.json();
      const tradeData = await tradesRes.json();
      const orderData = await ordersRes.json();

      setBalances(
        wallet?.wallet?.balances ||
        wallet?.spot?.balances ||
        []
      );

      setTrades(
        Array.isArray(tradeData?.trades)
          ? tradeData.trades
          : Array.isArray(tradeData?.data)
            ? tradeData.data
            : []
      );

      setOrders(
        Array.isArray(orderData?.orders)
          ? orderData.orders
          : Array.isArray(orderData?.data)
            ? orderData.data
            : []
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "حدث خطأ أثناء تحميل التقرير"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTrades = useMemo(() => {
    const days = Number(period);

    if (period === "all") return trades;

    const from = Date.now() - days * 24 * 60 * 60 * 1000;

    return trades.filter((trade) => {
      const time = new Date(trade.createdAt || "").getTime();
      return Number.isFinite(time) && time >= from;
    });
  }, [trades, period]);

  const stats = useMemo(() => {
    let volume = 0;
    let fees = 0;
    let buys = 0;
    let sells = 0;

    for (const trade of filteredTrades) {
      const value =
        n(trade.quoteQuantity) ||
        n(trade.quantity) * n(trade.price);

      volume += value;
      fees += n(trade.fee);

      if (trade.side === "buy") buys += value;
      if (trade.side === "sell") sells += value;
    }

    const completedOrders = orders.filter(
      (o) =>
        o.status === "filled" ||
        o.status === "partially_filled"
    ).length;

    return {
      volume,
      fees,
      buys,
      sells,
      completedOrders,
      tradeCount: filteredTrades.length,
    };
  }, [filteredTrades, orders]);

  const distribution = useMemo(() => {
    const total = balances.reduce(
      (sum, b) => sum + n(b.total ?? n(b.free) + n(b.locked)),
      0
    );

    return balances
      .map((b) => {
        const amount = n(b.total ?? n(b.free) + n(b.locked));
        return {
          asset: b.asset,
          amount,
          percent: total > 0 ? (amount / total) * 100 : 0,
        };
      })
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [balances]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <Navbar />

      <main className="mx-auto max-w-[1500px] px-4 py-8 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 text-xs font-medium text-cyan-400">
              الحساب
            </div>
            <h1 className="text-2xl font-bold">التقارير المالية</h1>
            <p className="mt-2 text-sm text-slate-500">
              تحليل نشاط التداول والرسوم والأصول في حسابك.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex rounded-xl border border-white/10 bg-[#07101d] p-1">
              {[
                ["7", "7 أيام"],
                ["30", "30 يوم"],
                ["90", "90 يوم"],
                ["all", "الكل"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setPeriod(value)}
                  className={`rounded-lg px-3 py-2 text-xs transition ${
                    period === value
                      ? "bg-white/10 text-white"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={load}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]"
            >
              <RefreshCw size={16} />
              تحديث
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
              <BarChart3 size={17} />
              حجم التداول
            </div>
            <div className="text-2xl font-bold">
              {loading ? "—" : fmt(stats.volume)}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              خلال الفترة المحددة
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
              <Activity size={17} />
              عدد الصفقات
            </div>
            <div className="text-2xl font-bold">
              {loading ? "—" : fmt(stats.tradeCount, 0)}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              الصفقات المسجلة فعليًا
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
              <TrendingUp size={17} />
              مشتريات
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {loading ? "—" : fmt(stats.buys)}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              القيمة المسجلة للشراء
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
              <TrendingDown size={17} />
              رسوم التداول
            </div>
            <div className="text-2xl font-bold">
              {loading ? "—" : fmt(stats.fees, 8)}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              حسب بيانات التنفيذ المتاحة
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
          <section className="rounded-2xl border border-white/10 bg-[#07101d]">
            <div className="border-b border-white/10 p-5">
              <h2 className="font-semibold">نشاط التداول</h2>
              <p className="mt-1 text-xs text-slate-600">
                أحدث الصفقات المسجلة خلال الفترة المختارة.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-right text-sm">
                <thead className="border-b border-white/5 text-xs text-slate-600">
                  <tr>
                    <th className="px-5 py-4 font-medium">التاريخ</th>
                    <th className="px-5 py-4 font-medium">الزوج</th>
                    <th className="px-5 py-4 font-medium">النوع</th>
                    <th className="px-5 py-4 font-medium">السعر</th>
                    <th className="px-5 py-4 font-medium">القيمة</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-16 text-center text-slate-600"
                      >
                        جاري تحميل التقرير...
                      </td>
                    </tr>
                  ) : filteredTrades.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-16 text-center text-slate-600"
                      >
                        لا توجد صفقات خلال هذه الفترة.
                      </td>
                    </tr>
                  ) : (
                    filteredTrades.slice(0, 100).map((trade, index) => {
                      const value =
                        n(trade.quoteQuantity) ||
                        n(trade.quantity) * n(trade.price);

                      return (
                        <tr
                          key={trade._id || trade.id || index}
                          className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                        >
                          <td className="px-5 py-4 text-xs text-slate-500">
                            {date(trade.createdAt)}
                          </td>

                          <td className="px-5 py-4 font-semibold">
                            {trade.symbol}
                          </td>

                          <td
                            className={`px-5 py-4 font-medium ${
                              trade.side === "buy"
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {trade.side === "buy" ? "شراء" : "بيع"}
                          </td>

                          <td className="px-5 py-4 font-mono text-slate-300">
                            {fmt(n(trade.price), 8)}
                          </td>

                          <td className="px-5 py-4 font-mono text-slate-300">
                            {fmt(value, 8)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
                <Wallet size={19} />
              </div>
              <div>
                <h2 className="font-semibold">توزيع الأصول</h2>
                <p className="text-xs text-slate-600">
                  الأرصدة الموجودة في الحساب
                </p>
              </div>
            </div>

            {distribution.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-600">
                لا توجد أصول مسجلة.
              </div>
            ) : (
              <div className="space-y-5">
                {distribution.map((item) => (
                  <div key={item.asset}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-semibold">{item.asset}</span>
                      <span className="text-slate-500">
                        {fmt(item.percent, 1)}%
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{
                          width: `${Math.min(item.percent, 100)}%`,
                        }}
                      />
                    </div>

                    <div className="mt-1 text-xs text-slate-600">
                      {fmt(item.amount, 8)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#07101d] p-5">
          <h2 className="font-semibold">ملخص الحساب</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-black/10 p-4">
              <div className="text-xs text-slate-600">
                أوامر مكتملة/جزئيًا
              </div>
              <div className="mt-2 text-xl font-semibold">
                {loading ? "—" : fmt(stats.completedOrders, 0)}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-black/10 p-4">
              <div className="text-xs text-slate-600">
                قيمة المبيعات
              </div>
              <div className="mt-2 text-xl font-semibold">
                {loading ? "—" : fmt(stats.sells)}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-black/10 p-4">
              <div className="text-xs text-slate-600">
                الأصول المسجلة
              </div>
              <div className="mt-2 text-xl font-semibold">
                {loading ? "—" : fmt(distribution.length, 0)}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
