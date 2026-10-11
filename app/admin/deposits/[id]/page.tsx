"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import Link from "next/link";
import { useEffect, useState } from "react";

function value(v: unknown) {
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

function date(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-US");
}

export default function DepositDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState("");
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void params.then((x) => setId(x.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    void (async () => {
      try {
        const res = await fetch(`/api/admin/deposits/${id}`, {
          credentials: "include",
          cache: "no-store",
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.message || "تعذر تحميل الطلب");
        }

        setItem(json.item);
      } catch (e) {
        alert(e instanceof Error ? e.message : "تعذر تحميل الطلب");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function review(status: "approved" | "rejected") {
    let adminNote = "";

    if (status === "rejected") {
      adminNote = window.prompt("اكتب سبب رفض الإيداع:") || "";

      if (!adminNote.trim()) return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/admin/deposits", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          status,
          adminNote,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || "تعذر معالجة الطلب");
      }

      alert(json?.message || "تمت معالجة الطلب");

      window.location.href = "/admin/deposits";
    } catch (e) {
      alert(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageFrame title="تفاصيل طلب الإيداع">
      <div dir="rtl">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-500">
            جاري تحميل الطلب...
          </div>
        ) : !item ? (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-500">
            الطلب غير موجود.
          </div>
        ) : (
          <div className="space-y-5">
            <Link
              href="/admin/deposits"
              className="inline-flex rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 font-bold"
            >
              ← العودة للإيداعات
            </Link>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(item)
                .filter(
                  ([key]) =>
                    !["_id", "__v", "screenshotPath"].includes(key)
                )
                .map(([key, val]) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-slate-800 bg-[#08111e] p-5"
                  >
                    <div className="text-xs text-slate-500">{key}</div>
                    <div className="mt-2 break-all text-sm font-bold">
                      {key === "createdAt" || key === "updatedAt"
                        ? date(val)
                        : value(val)}
                    </div>
                  </div>
                ))}
            </div>

            {item.screenshotPath ? (
              <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                <div className="mb-4 text-lg font-black">
                  Screenshot التحويل
                </div>

                <img
                  src={`/api/admin/deposits/file?id=${encodeURIComponent(id)}`}
                  alt="Screenshot الإيداع"
                  className="max-h-[700px] w-full rounded-xl border border-slate-800 bg-black object-contain"
                />
              </div>
            ) : null}

            {item.status === "pending" ? (
              <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                <button
                  disabled={busy}
                  onClick={() => void review("approved")}
                  className="rounded-xl bg-emerald-600 px-7 py-3 font-black disabled:opacity-50"
                >
                  اعتماد الإيداع
                </button>

                <button
                  disabled={busy}
                  onClick={() => void review("rejected")}
                  className="rounded-xl bg-red-600 px-7 py-3 font-black disabled:opacity-50"
                >
                  رفض الإيداع
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                تمت معالجة الطلب بالفعل: <b>{item.status}</b>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminPageFrame>
  );
}