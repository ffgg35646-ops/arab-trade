"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  title: string;
  endpoint: string;
};

function prettyKey(key: string) {
  const map: Record<string, string> = {
    _id: "المعرف",
    id: "المعرف",
    name: "الاسم",
    username: "اسم المستخدم",
    email: "البريد الإلكتروني",
    role: "الصلاحية",
    isActive: "الحالة",
    isVerified: "موثق",
    status: "الحالة",
    amount: "المبلغ",
    asset: "الأصل",
    symbol: "الرمز",
    price: "السعر",
    quantity: "الكمية",
    createdAt: "تاريخ الإنشاء",
    updatedAt: "آخر تحديث",
    network: "الشبكة",
    txHash: "TX Hash",
  };
  return map[key] || key;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export default function AdminSectionPage({ title, endpoint }: Props) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || json?.error || "تعذر تحميل البيانات");
      }

      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const records = useMemo(() => {
    if (!data) return [];

    if (Array.isArray(data)) return data;

    if (typeof data === "object") {
      const obj = data as Record<string, unknown>;

      for (const key of [
        "users",
        "orders",
        "deposits",
        "withdrawals",
        "assets",
        "requests",
        "rewards",
        "logs",
        "announcements",
        "payments",
        "data",
        "items",
      ]) {
        if (Array.isArray(obj[key])) return obj[key];
      }
    }

    return [];
  }, [data]);

  const objectData =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;

  const keys = useMemo(() => {
    const set = new Set<string>();

    for (const item of records.slice(0, 100)) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        Object.keys(item as Record<string, unknown>).forEach((k) => set.add(k));
      }
    }

    return [...set].slice(0, 14);
  }, [records]);

  async function runPost(path: string, body: Record<string, unknown> = {}) {
    setActionLoading(true);
    setError("");

    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || json?.error || "فشل تنفيذ العملية");
      }

      await load();
      alert(json?.message || "تم تنفيذ العملية بنجاح");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تنفيذ العملية");
    } finally {
      setActionLoading(false);
    }
  }

  function renderActionButtons(item: any) {
    if (!item || typeof item !== "object") return null;

    const id = item._id || item.id;
    const status = String(item.status || "").toLowerCase();

    if (!id) return null;

    if (
      endpoint.includes("/deposits") &&
      ["pending", "review", "processing"].includes(status)
    ) {
      return (
        <div className="flex gap-2">
          <button
            disabled={actionLoading}
            onClick={() =>
              runPost("/api/admin/deposits", {
                id,
                action: "approve",
              })
            }
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            اعتماد
          </button>
          <button
            disabled={actionLoading}
            onClick={() =>
              runPost("/api/admin/deposits", {
                id,
                action: "reject",
              })
            }
            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            رفض
          </button>
        </div>
      );
    }

    if (
      endpoint.includes("/withdrawals") &&
      ["pending", "review", "processing"].includes(status)
    ) {
      return (
        <div className="flex gap-2">
          <button
            disabled={actionLoading}
            onClick={() =>
              runPost("/api/admin/withdrawals", {
                id,
                action: "approve",
              })
            }
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            اعتماد
          </button>
          <button
            disabled={actionLoading}
            onClick={() =>
              runPost("/api/admin/withdrawals", {
                id,
                action: "reject",
              })
            }
            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            رفض
          </button>
        </div>
      );
    }

    return null;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <div className="mx-auto max-w-[1600px] p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">{title}</h1>
            <p className="mt-1 text-sm text-slate-400">
              إدارة {title} من لوحة التحكم
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-5 py-3 text-sm font-bold hover:bg-[#101c2d] disabled:opacity-50"
          >
            {loading ? "جاري التحميل..." : "تحديث البيانات"}
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-400">
            جاري تحميل بيانات {title}...
          </div>
        ) : records.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="border-b border-slate-800 bg-[#0c1726]">
                  <tr>
                    {keys.map((key) => (
                      <th key={key} className="whitespace-nowrap px-4 py-4 font-bold text-slate-300">
                        {prettyKey(key)}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-4 py-4 font-bold text-slate-300">
                      الإجراءات
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {records.map((item: any, index) => (
                    <tr
                      key={item?._id || item?.id || index}
                      className="border-b border-slate-800/70 last:border-0 hover:bg-white/[0.02]"
                    >
                      {keys.map((key) => (
                        <td
                          key={key}
                          className="max-w-[320px] whitespace-nowrap px-4 py-4 text-slate-200"
                        >
                          {formatValue(item?.[key])}
                        </td>
                      ))}
                      <td className="px-4 py-4">
                        {renderActionButtons(item) || (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : objectData ? (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-6">
            <h2 className="mb-4 text-lg font-black">بيانات القسم</h2>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(objectData).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl border border-slate-800 bg-[#0b1422] p-4"
                >
                  <div className="mb-2 text-xs font-bold text-slate-500">
                    {prettyKey(key)}
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-200">
                    {formatValue(value)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-400">
            لا توجد بيانات متاحة حاليًا لهذا القسم.
          </div>
        )}
      </div>
    </main>
  );
}