"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Dashboard = {
  stats: {
    users: number;
    activeUsers: number;
    blockedUsers: number;
    orders: number;
    trades: number;
    assets: number;
    deposits: number;
    pendingDeposits: number;
  };
  latestUsers: any[];
  latestDeposits: any[];
};

function money(v: unknown) {
  if (v === null || v === undefined) return "—";
  return String(v);
}

function date(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-US");
}

export default function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const response = await fetch("/api/admin/dashboard", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.message || json?.error || "تعذر تحميل الداشبورد");
      }

      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {data ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black">نظرة عامة</h1>
                <p className="mt-1 text-sm text-slate-500">
                  أرقام مباشرة من قاعدة بيانات المنصة
                </p>
              </div>

              <button
                onClick={() => void load()}
                className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm font-bold"
              >
                تحديث
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["المستخدمون", data.stats.users, "/admin/users"],
                ["الإيداعات", data.stats.deposits, "/admin/deposits"],
                ["الأوامر", data.stats.orders, "/admin/orders"],
                ["الصفقات", data.stats.trades, "/admin/trading"],
              ].map(([name, value, href]) => (
                <Link
                  key={String(name)}
                  href={String(href)}
                  className="rounded-2xl border border-slate-800 bg-[#08111e] p-5 transition hover:border-blue-500/40"
                >
                  <div className="text-sm text-slate-500">{name}</div>
                  <div className="mt-3 text-3xl font-black">
                    {Number(value).toLocaleString("en-US")}
                  </div>
                </Link>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/admin/users?status=active" className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                <div className="text-sm text-slate-500">مستخدمون نشطون</div>
                <div className="mt-2 text-2xl font-black">{data.stats.activeUsers.toLocaleString("en-US")}</div>
              </Link>

              <Link href="/admin/users?status=blocked" className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                <div className="text-sm text-slate-500">مستخدمون محظورون</div>
                <div className="mt-2 text-2xl font-black">{data.stats.blockedUsers.toLocaleString("en-US")}</div>
              </Link>

              <Link href="/admin/deposits" className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                <div className="text-sm text-slate-500">إيداعات معلقة</div>
                <div className="mt-2 text-2xl font-black">{data.stats.pendingDeposits.toLocaleString("en-US")}</div>
              </Link>

            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
                <div className="flex items-center justify-between border-b border-slate-800 p-5">
                  <h2 className="font-black">أحدث المستخدمين</h2>
                  <Link href="/admin/users" className="text-sm text-blue-400">عرض الكل</Link>
                </div>

                <div className="divide-y divide-slate-800">
                  {data.latestUsers.map((user) => (
                    <div key={user._id} className="p-4">
                      <div className="font-bold">{user.name || user.username || "بدون اسم"}</div>
                      <div className="mt-1 text-xs text-slate-500">{user.email}</div>
                      <div className="mt-2 text-xs text-slate-600">{date(user.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
                <div className="flex items-center justify-between border-b border-slate-800 p-5">
                  <h2 className="font-black">أحدث الإيداعات</h2>
                  <Link href="/admin/deposits" className="text-sm text-blue-400">عرض الكل</Link>
                </div>

                <div className="divide-y divide-slate-800">
                  {data.latestDeposits.map((item) => (
                    <div key={item._id} className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <div className="font-bold">{money(item.amount)} {item.asset || item.symbol || ""}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.status || "—"}</div>
                      </div>
                      <div className="text-left text-xs text-slate-500">{date(item.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </section>

            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-red-300">
            {error}
            <button
              onClick={() => void load()}
              className="mr-3 rounded-lg bg-red-900/50 px-3 py-2 text-xs font-bold"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <div className="space-y-5" aria-hidden="true">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.04]" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-28 rounded-2xl border border-slate-800 bg-[#08111e]" />
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-24 rounded-2xl border border-slate-800 bg-[#08111e]" />
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-64 rounded-2xl border border-slate-800 bg-[#08111e]" />
              ))}
            </div>
          </div>
        )}
    </>
  );
}