 "use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function rowsFrom(data: any): any[] {
  if (Array.isArray(data)) return data;

  for (const key of [
    "deposits",
    "withdrawals",
    "requests",
    "items",
    "data",
  ]) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function date(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-US");
}

export default function Page() {
  const [data, setData] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/withdrawals", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.message || json?.error || "تعذر تحميل البيانات"
        );
      }

      setData(rowsFrom(json));
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return [...data]
      .filter((item) => {
        if (status === "all") return true;
        return String(item.status || "").toLowerCase() === status;
      })
      .filter((item) => {
        if (!q) return true;
        return JSON.stringify(item).toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aa = new Date(String(a.createdAt || a.updatedAt || 0)).getTime();
        const bb = new Date(String(b.createdAt || b.updatedAt || 0)).getTime();
        return sort === "newest" ? bb - aa : aa - bb;
      });
  }, [data, search, status, sort]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const item of data) {
      if (item.status) set.add(String(item.status));
    }
    return [...set];
  }, [data]);

  const columns = useMemo(() => {
    const set = new Set<string>();

    for (const item of filtered.slice(0, 100)) {
      if (item && typeof item === "object") {
        Object.keys(item).forEach((key) => set.add(key));
      }
    }

    return [...set]
      .filter((key) => !["__v"].includes(key))
      .slice(0, 12);
  }, [filtered]);

  function label(key: string) {
    const map: Record<string, string> = {
      _id: "المعرف",
      id: "المعرف",
      userId: "المستخدم",
      amount: "المبلغ",
      asset: "الأصل",
      symbol: "الرمز",
      network: "الشبكة",
      status: "الحالة",
      txHash: "TX Hash",
      address: "العنوان",
      fee: "الرسوم",
      createdAt: "تاريخ الإنشاء",
      updatedAt: "التحديث",
    };

    return map[key] || key;
  }

  function val(v: unknown) {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  }

  return (
    <AdminPageFrame title="السحوبات">
      <div dir="rtl" className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث..."
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm outline-none"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm outline-none"
          >
            <option value="all">كل الحالات</option>
            {statuses.map((s) => (
              <option key={s} value={s.toLowerCase()}>{"{"}s{"}"}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm outline-none"
          >
            <option value="newest">الأحدث أولًا</option>
            <option value="oldest">الأقدم أولًا</option>
          </select>

          <button
            onClick={() => void load()}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold"
          >
            تحديث
          </button>
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-slate-400">
          <span>إجمالي السجلات: <b className="text-white">{data.length}</b></span>
          <span>المعروض: <b className="text-white">{filtered.length}</b></span>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              جاري تحميل البيانات...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              لا توجد سجلات مطابقة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="border-b border-slate-800 bg-[#0c1726]">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="whitespace-nowrap px-4 py-4 font-bold">
                        {label(column)}
                      </th>
                    ))}
                    <th className="px-4 py-4 font-bold">الإجراء</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((item, index) => (
                    <tr
                      key={String(item._id || item.id || index)}
                      className="border-b border-slate-800/70 last:border-0"
                    >
                      {columns.map((column) => (
                        <td
                          key={column}
                          className="max-w-[340px] whitespace-nowrap px-4 py-4 text-slate-200"
                        >
                          {column === "createdAt" || column === "updatedAt"
                            ? date(item[column])
                            : val(item[column])}
                        </td>
                      ))}
                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/withdrawals/${item._id || item.id}`}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold"
                        >
                          تفاصيل الطلب
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminPageFrame>
  );
}