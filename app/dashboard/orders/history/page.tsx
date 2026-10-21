"use client";

import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Order = {
  _id: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  quantity: number;
  quoteAmount: number;
  status: string;
  createdAt?: string;
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

function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "open":
      return "مفتوح";
    case "filled":
      return "منفذ";
    case "cancelled":
      return "ملغى";
    case "rejected":
      return "مرفوض";
    case "partially_filled":
      return "منفذ جزئياً";
    default:
      return status;
  }
}

function statusClass(status: string) {
  switch (status.toLowerCase()) {
    case "open":
      return "border-blue-400/20 bg-blue-400/10 text-blue-300";
    case "filled":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
    case "cancelled":
      return "border-slate-400/20 bg-slate-400/10 text-slate-300";
    case "rejected":
      return "border-red-400/20 bg-red-400/10 text-red-300";
    case "partially_filled":
      return "border-amber-400/20 bg-amber-400/10 text-amber-300";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const query = status
        ? `?status=${encodeURIComponent(status)}`
        : "";

      const res = await fetch(`/api/orders${query}`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "تعذر تحميل سجل الأوامر");
      }

      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  const filteredOrders = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return orders;

    return orders.filter((order) =>
      order.symbol.toLowerCase().includes(value)
    );
  }, [orders, search]);

  return (
    <div
      className="min-h-screen bg-[#050a13] text-white"
      dir="rtl"
    >
      

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1700px]">
        

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-[1500px]">

            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">
                  التداول / الطلبات
                </div>

                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  سجل الأوامر
                </h1>

                <p className="mt-2 text-sm text-slate-400">
                  راجع جميع أوامرك السابقة والحالية بالتفصيل.
                </p>
              </div>

              <button
                onClick={load}
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

            {/* Filters */}
            <div className="mb-5 rounded-2xl border border-white/10 bg-[#07101d] p-4">
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="relative flex-1">
                  <Search
                    size={17}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                  />

                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ابحث عن زوج تداول..."
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.025] pr-11 pl-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-white/20"
                  />
                </div>

                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-11 rounded-xl border border-white/10 bg-[#07101d] px-4 text-sm text-slate-200 outline-none focus:border-white/20"
                >
                  <option value="">كل الحالات</option>
                  <option value="open">مفتوح</option>
                  <option value="filled">منفذ</option>
                  <option value="partially_filled">
                    منفذ جزئياً
                  </option>
                  <option value="cancelled">ملغى</option>
                  <option value="rejected">مرفوض</option>
                </select>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Stats */}
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-4">
                <div className="text-xs text-slate-500">
                  إجمالي الأوامر
                </div>
                <div className="mt-2 text-xl font-bold">
                  {orders.length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-4">
                <div className="text-xs text-slate-500">
                  الأوامر المفتوحة
                </div>
                <div className="mt-2 text-xl font-bold text-blue-300">
                  {orders.filter((o) => o.status === "open").length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-4">
                <div className="text-xs text-slate-500">
                  الأوامر المنفذة
                </div>
                <div className="mt-2 text-xl font-bold text-emerald-300">
                  {orders.filter((o) => o.status === "filled").length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-4">
                <div className="text-xs text-slate-500">
                  النتائج الحالية
                </div>
                <div className="mt-2 text-xl font-bold">
                  {filteredOrders.length}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">
              <div className="border-b border-white/5 px-5 py-4">
                <h2 className="text-sm font-semibold">
                  جميع الأوامر
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-right text-sm">
                  <thead className="bg-white/[0.025] text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-medium">
                        الزوج
                      </th>
                      <th className="px-5 py-4 font-medium">
                        الاتجاه
                      </th>
                      <th className="px-5 py-4 font-medium">
                        النوع
                      </th>
                      <th className="px-5 py-4 font-medium">
                        السعر
                      </th>
                      <th className="px-5 py-4 font-medium">
                        الكمية
                      </th>
                      <th className="px-5 py-4 font-medium">
                        القيمة
                      </th>
                      <th className="px-5 py-4 font-medium">
                        الحالة
                      </th>
                      <th className="px-5 py-4 font-medium">
                        التاريخ
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/5">
                    {filteredOrders.map((order) => (
                      <tr
                        key={order._id}
                        className="transition hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-4">
                          <span className="font-semibold text-white">
                            {order.symbol}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={
                              order.side === "buy"
                                ? "font-medium text-emerald-400"
                                : "font-medium text-red-400"
                            }
                          >
                            {order.side === "buy" ? "شراء" : "بيع"}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-slate-300">
                          {order.type === "limit"
                            ? "محدد"
                            : "سوق"}
                        </td>

                        <td className="px-5 py-4 font-mono text-slate-200">
                          {formatNumber(order.price)}
                        </td>

                        <td className="px-5 py-4 font-mono text-slate-300">
                          {formatNumber(order.quantity)}
                        </td>

                        <td className="px-5 py-4 font-mono text-slate-300">
                          {formatNumber(order.quoteAmount)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-medium ${statusClass(
                              order.status
                            )}`}
                          >
                            {statusLabel(order.status)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-xs text-slate-500">
                          {formatDate(order.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!loading && filteredOrders.length === 0 && (
                <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
                  <div>
                    <div className="mb-2 text-sm font-medium text-slate-300">
                      لا توجد أوامر
                    </div>

                    <div className="text-xs text-slate-600">
                      لا توجد أوامر مطابقة للفلاتر الحالية.
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex min-h-[260px] items-center justify-center">
                  <div className="text-sm text-slate-500">
                    جاري تحميل سجل الأوامر...
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