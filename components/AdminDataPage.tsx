"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function getRows(data: any): any[] {
  if (Array.isArray(data)) return data;

  const keys = [
    "items",
    "data",
    "users",
    "orders",
    "deposits",
    "withdrawals",
    "trades",
    "requests",
    "rewards",
    "logs",
    "notifications",
    "commissions",
    "positions",
    "loans",
    "payments",
    "assets",
  ];

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function displayLabel(key: string): string {
  const labels: Record<string, string> = {
    _id: "المعرف",
    id: "المعرف",
    name: "الاسم",
    username: "اسم المستخدم",
    email: "البريد الإلكتروني",
    role: "الصلاحية",
    status: "الحالة",
    isActive: "نشط",
    isVerified: "موثق",
    amount: "المبلغ",
    asset: "الأصل",
    symbol: "الرمز",
    network: "الشبكة",
    price: "السعر",
    quantity: "الكمية",
    side: "الاتجاه",
    type: "النوع",
    fee: "الرسوم",
    txHash: "TX Hash",
    createdAt: "تاريخ الإنشاء",
    updatedAt: "آخر تحديث",
  };

  return labels[key] || key;
}

export default function AdminDataPage({
  title,
  endpoint,
}: {
  title: string;
  endpoint: string;
}) {
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const response = await fetch(endpoint, {
        credentials: "include",
        cache: "no-store",
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          json?.message || json?.error || "تعذر تحميل البيانات"
        );
      }

      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const all = getRows(data);
    const q = search.trim().toLowerCase();

    if (!q) return all;

    return all.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(q)
    );
  }, [data, search]);

  const columns = useMemo(() => {
    const set = new Set<string>();

    for (const row of rows.slice(0, 100)) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        Object.keys(row).forEach((key) => set.add(key));
      }
    }

    return [...set].slice(0, 15);
  }, [rows]);

  return (
    <section dir="rtl">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            البيانات من الـBackend وقاعدة البيانات مباشرة
          </p>
        </div>

        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث..."
            className="w-56 rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm text-white outline-none"
          />

          <button
            onClick={() => void load()}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm font-bold hover:bg-[#101c2d]"
          >
            تحديث
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="min-h-[10rem]" aria-hidden="true" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-400">
          لا توجد سجلات.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="border-b border-slate-800 bg-[#0c1726]">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap px-4 py-4 font-bold text-slate-300"
                    >
                      {displayLabel(column)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={String(row?._id || row?.id || index)}
                    className="border-b border-slate-800/70 hover:bg-white/[0.02]"
                  >
                    {columns.map((column) => (
                      <td
                        key={column}
                        className="max-w-[360px] whitespace-nowrap px-4 py-4 text-slate-200"
                      >
                        {displayValue(row?.[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}