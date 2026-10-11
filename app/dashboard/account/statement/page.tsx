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

type Balance = {
  asset: string;
  free?: number;
  locked?: number;
  total?: number;
};

type WalletResponse = {
  wallet?: {
    balances?: Balance[];
  };
  spot?: {
    balances?: Balance[];
  };
  funding?: {
    balances?: Balance[];
  };
};

type Order = {
  _id?: string;
  id?: string;
  symbol: string;
  side: "buy" | "sell";
  type?: string;
  status?: string;
  price?: number;
  quantity?: number;
  originalQuantity?: number;
  filledQuantity?: number;
  remainingQuantity?: number;
  createdAt?: string;
  updatedAt?: string;
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
  feeAsset?: string;
  createdAt?: string;
};

type Entry = {
  id: string;
  date: string;
  type: string;
  asset: string;
  amount: number;
  direction: "in" | "out" | "neutral";
  status: string;
  detail: string;
};

function n(value: unknown) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function formatNumber(value: number, digits = 8) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function splitSymbol(symbol: string) {
  const clean = String(symbol || "").toUpperCase();
  const quotes = ["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB"];
  const quote = quotes.find((q) => clean.endsWith(q));
  if (!quote) return { base: clean, quote: "" };
  return {
    base: clean.slice(0, -quote.length),
    quote,
  };
}

export default function StatementPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [asset, setAsset] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [walletRes, ordersRes, tradesRes] = await Promise.all([
        fetch("/api/wallet", { cache: "no-store" }),
        fetch("/api/orders?limit=500", { cache: "no-store" }),
        fetch("/api/trades?limit=500", { cache: "no-store" }),
      ]);

      if (!walletRes.ok || !ordersRes.ok || !tradesRes.ok) {
        throw new Error("تعذر تحميل بيانات الحساب");
      }

      const wallet: WalletResponse = await walletRes.json();
      const ordersData = await ordersRes.json();
      const tradesData = await tradesRes.json();

      const walletBalances =
        wallet.wallet?.balances ||
        wallet.spot?.balances ||
        [];

      setBalances(Array.isArray(walletBalances) ? walletBalances : []);
      setOrders(
        Array.isArray(ordersData?.orders)
          ? ordersData.orders
          : Array.isArray(ordersData?.data)
            ? ordersData.data
            : []
      );
      setTrades(
        Array.isArray(tradesData?.trades)
          ? tradesData.trades
          : Array.isArray(tradesData?.data)
            ? tradesData.data
            : []
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const assets = useMemo(() => {
    const set = new Set<string>();

    balances.forEach((b) => {
      if (b.asset) set.add(b.asset.toUpperCase());
    });

    trades.forEach((t) => {
      const { base, quote } = splitSymbol(t.symbol);
      if (base) set.add(base);
      if (quote) set.add(quote);
    });

    orders.forEach((o) => {
      const { base, quote } = splitSymbol(o.symbol);
      if (base) set.add(base);
      if (quote) set.add(quote);
    });

    return Array.from(set).sort();
  }, [balances, orders, trades]);

  const entries = useMemo<Entry[]>(() => {
    const result: Entry[] = [];

    for (const trade of trades) {
      const { base, quote } = splitSymbol(trade.symbol);
      const quantity = n(trade.quantity);
      const price = n(trade.price);
      const quoteQuantity =
        n(trade.quoteQuantity) || quantity * price;

      const side = trade.side === "buy" ? "شراء" : "بيع";

      result.push({
        id: `trade-${trade._id || trade.id || Math.random()}`,
        date: trade.createdAt || "",
        type: "تداول",
        asset: quote || base,
        amount: quoteQuantity,
        direction: "neutral",
        status: "مكتمل",
        detail: `${side} ${quantity} ${base}${price ? ` بسعر ${formatNumber(price, 8)}` : ""}`,
      });

      if (trade.fee && n(trade.fee) > 0) {
        result.push({
          id: `fee-${trade._id || trade.id || Math.random()}`,
          date: trade.createdAt || "",
          type: "رسوم تداول",
          asset: trade.feeAsset || quote || "USDT",
          amount: n(trade.fee),
          direction: "out",
          status: "مكتمل",
          detail: "رسوم تنفيذ الصفقة",
        });
      }
    }

    for (const order of orders) {
      const filled = n(order.filledQuantity);

      if (filled <= 0) continue;

      const { base, quote } = splitSymbol(order.symbol);
      const value = filled * n(order.price);

      result.push({
        id: `order-${order._id || order.id || `${order.symbol}-${order.createdAt}`}`,
        date: order.updatedAt || order.createdAt || "",
        type: order.side === "buy" ? "شراء" : "بيع",
        asset: quote || base,
        amount: value,
        direction: order.side === "buy" ? "out" : "in",
        status: "مكتمل",
        detail: `${order.side === "buy" ? "شراء" : "بيع"} ${formatNumber(filled)} ${base}`,
      });
    }

    return result
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      .filter((entry) => {
        if (asset !== "ALL" && entry.asset !== asset) return false;
        if (kind !== "ALL" && entry.type !== kind) return false;

        const q = search.trim().toLowerCase();
        if (
          q &&
          !entry.asset.toLowerCase().includes(q) &&
          !entry.detail.toLowerCase().includes(q) &&
          !entry.type.toLowerCase().includes(q)
        ) {
          return false;
        }

        return true;
      });
  }, [trades, orders, asset, kind, search]);

  const stats = useMemo(() => {
    const totalTrading = trades.reduce(
      (sum, t) =>
        sum +
        (n(t.quoteQuantity) || n(t.quantity) * n(t.price)),
      0
    );

    const fees = trades.reduce((sum, t) => sum + n(t.fee), 0);

    const totalAssets = balances.reduce(
      (sum, b) => sum + n(b.total ?? n(b.free) + n(b.locked)),
      0
    );

    return {
      totalTrading,
      fees,
      totalAssets,
    };
  }, [balances, trades]);

  const exportCsv = () => {
    const header = [
      "Date",
      "Type",
      "Asset",
      "Amount",
      "Status",
      "Details",
    ];

    const rows = entries.map((e) => [
      e.date,
      e.type,
      e.asset,
      e.amount,
      e.status,
      e.detail,
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "arabtrade-account-statement.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <Navbar />

      <main className="mx-auto max-w-[1500px] px-4 py-8 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 text-xs font-medium text-cyan-400">
              الحساب
            </div>
            <h1 className="text-2xl font-bold">كشف الحساب</h1>
            <p className="mt-2 text-sm text-slate-500">
              سجل تفصيلي لحركات التداول والرسوم والأرصدة المرتبطة بحسابك.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]"
            >
              <RefreshCw size={16} />
              تحديث
            </button>

            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              <Download size={16} />
              تصدير CSV
            </button>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
              <Wallet size={17} />
              قيمة الأصول المسجلة
            </div>
            <div className="text-2xl font-bold">
              {loading ? "—" : formatNumber(stats.totalAssets, 8)}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              حسب أرصدة الحساب المتاحة
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 text-sm text-slate-500">
              إجمالي حجم التداول
            </div>
            <div className="text-2xl font-bold">
              {loading ? "—" : formatNumber(stats.totalTrading, 2)}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              من الصفقات المسجلة في الحساب
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
            <div className="mb-4 text-sm text-slate-500">
              إجمالي الرسوم
            </div>
            <div className="text-2xl font-bold">
              {loading ? "—" : formatNumber(stats.fees, 8)}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              الرسوم التي سجلها محرك التداول
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#07101d]">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في كشف الحساب..."
                className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-4 pr-10 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
              />
            </div>

            <label className="relative">
              <select
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                className="appearance-none rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-slate-300 outline-none"
              >
                <option value="ALL">كل الأصول</option>
                {assets.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
              />
            </label>

            <label className="relative">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="appearance-none rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-slate-300 outline-none"
              >
                <option value="ALL">كل العمليات</option>
                <option value="تداول">تداول</option>
                <option value="شراء">شراء</option>
                <option value="بيع">بيع</option>
                <option value="رسوم تداول">رسوم تداول</option>
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-right text-sm">
              <thead className="border-b border-white/5 bg-white/[0.015] text-xs text-slate-600">
                <tr>
                  <th className="px-5 py-4 font-medium">التاريخ</th>
                  <th className="px-5 py-4 font-medium">النوع</th>
                  <th className="px-5 py-4 font-medium">الأصل</th>
                  <th className="px-5 py-4 font-medium">المبلغ</th>
                  <th className="px-5 py-4 font-medium">الحالة</th>
                  <th className="px-5 py-4 font-medium">التفاصيل</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-16 text-center text-slate-600"
                    >
                      جاري تحميل كشف الحساب...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-16 text-center"
                    >
                      <div className="mx-auto max-w-sm">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-600">
                          <Wallet size={20} />
                        </div>
                        <div className="font-medium text-slate-300">
                          لا توجد حركات مسجلة
                        </div>
                        <div className="mt-2 text-xs text-slate-600">
                          ستظهر هنا عمليات التداول والرسوم بمجرد وجود نشاط في الحساب.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {formatDate(entry.date)}
                      </td>

                      <td className="px-5 py-4 font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          {entry.direction === "in" ? (
                            <ArrowDownToLine size={15} className="text-emerald-400" />
                          ) : entry.direction === "out" ? (
                            <ArrowUpFromLine size={15} className="text-red-400" />
                          ) : null}
                          {entry.type}
                        </div>
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {entry.asset}
                      </td>

                      <td
                        className={`px-5 py-4 font-mono ${
                          entry.direction === "in"
                            ? "text-emerald-400"
                            : entry.direction === "out"
                              ? "text-red-400"
                              : "text-slate-300"
                        }`}
                      >
                        {entry.direction === "in"
                          ? "+"
                          : entry.direction === "out"
                            ? "-"
                            : ""}
                        {formatNumber(entry.amount, 8)}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-400">
                          {entry.status}
                        </span>
                      </td>

                      <td className="max-w-[350px] px-5 py-4 text-xs text-slate-500">
                        {entry.detail}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
