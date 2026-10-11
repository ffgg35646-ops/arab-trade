"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import Link from "next/link";
import { useEffect, useState } from "react";

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";

  if (typeof value === "boolean") {
    return value ? "نعم" : "لا";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function label(key: string) {
  const labels: Record<string, string> = {
    _id: "المعرف",
    userId: "معرف المستخدم",
    amount: "المبلغ",
    asset: "الأصل",
    symbol: "الرمز",
    network: "الشبكة",
    address: "العنوان",
    txHash: "TX Hash",
    fee: "الرسوم",
    status: "الحالة",
    type: "النوع",
    side: "الاتجاه",
    price: "السعر",
    quantity: "الكمية",
    createdAt: "تاريخ الإنشاء",
    updatedAt: "آخر تحديث",
    completedAt: "تاريخ الإكمال",
    rejectedAt: "تاريخ الرفض",
    reason: "السبب",
  };

  return labels[key] || key;
}

function date(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString("en-US");
}

export default function AdminRequestDetail({
  title,
  endpoint,
  backHref,
  kind,
}: {
  title: string;
  endpoint: string;
  backHref: string;
  kind: "deposit" | "withdrawal";
}) {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(endpoint, {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || "تعذر تحميل الطلب");
      }

      setItem(json.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [endpoint]);

  async function action(actionName: "approve" | "reject") {
    let reason = "";

    if (actionName === "reject") {
      reason = window.prompt("اكتب سبب الرفض:") || "";
      if (!reason.trim()) return;
    }

    setBusy(true);

    try {
      const res = await fetch(backHref.replace("/admin/", "/api/admin/"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item._id,
          action: actionName,
          reason,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || "تعذر تنفيذ العملية");
      }

      await load();
      alert(json?.message || "تم تنفيذ العملية");
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageFrame title={title}>
      <div dir="rtl">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-500">
            جاري تحميل تفاصيل الطلب...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-red-300">
            {error}
          </div>
        ) : item ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={backHref}
                className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm font-bold"
              >
                ← العودة للطلبات
              </Link>

              <div className="rounded-xl border border-slate-800 bg-[#0b1422] px-4 py-3">
                الحالة: <span className="font-black">{item.status || "—"}</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(item)
                .filter(([key]) => !["_id", "__v"].includes(key))
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-slate-800 bg-[#08111e] p-5"
                  >
                    <div className="mb-2 text-xs font-bold text-slate-500">
                      {label(key)}
                    </div>

                    <pre className="whitespace-pre-wrap break-words text-sm text-slate-200">
                      {key === "createdAt" ||
                      key === "updatedAt" ||
                      key === "completedAt" ||
                      key === "rejectedAt"
                        ? date(value)
                        : formatValue(value)}
                    </pre>
                  </div>
                ))}
            </div>

            {["pending", "review", "processing"].includes(
              String(item.status || "").toLowerCase()
            ) ? (
              <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                <button
                  disabled={busy}
                  onClick={() => void action("approve")}
                  className="rounded-xl bg-emerald-600 px-6 py-3 font-black disabled:opacity-50"
                >
                  اعتماد
                </button>

                <button
                  disabled={busy}
                  onClick={() => void action("reject")}
                  className="rounded-xl bg-red-600 px-6 py-3 font-black disabled:opacity-50"
                >
                  رفض
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminPageFrame>
  );
}