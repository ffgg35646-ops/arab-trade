"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import Link from "next/link";
import { useEffect, useState } from "react";

function date(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString("en-US");
}

export default function KycDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState("");
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    void (async () => {
      try {
        const res = await fetch(`/api/admin/kyc/${id}`, {
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
    })();
  }, [id]);

  async function review(action: "approve" | "reject") {
    let reason = "";

    if (action === "reject") {
      reason = window.prompt("اكتب سبب رفض التوثيق:") || "";
      if (!reason.trim()) return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/admin/kyc", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          action,
          reason,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || "تعذر تنفيذ المراجعة");
      }

      alert(json?.message || "تم التنفيذ");
      window.location.href = "/admin/kyc";
    } catch (e) {
      alert(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageFrame title="تفاصيل طلب التوثيق">
      <div dir="rtl">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-500">
            جاري تحميل الطلب...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-red-300">
            {error}
          </div>
        ) : item ? (
          <div className="space-y-5">
            <Link
              href="/admin/kyc"
              className="inline-flex rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm font-bold"
            >
              ← العودة لطلبات التوثيق
            </Link>

            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                  <h2 className="mb-4 text-xl font-black">بيانات الحساب</h2>

                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-slate-500">
                        الاسم عند إنشاء الحساب
                      </span>
                      <div className="mt-1 font-black">
                        {item.userId?.name || "—"}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-slate-500">
                        اسم المستخدم
                      </span>
                      <div className="mt-1">{item.userId?.username || "—"}</div>
                    </div>

                    <div>
                      <span className="text-xs text-slate-500">
                        البريد الإلكتروني
                      </span>
                      <div className="mt-1">{item.userId?.email || "—"}</div>
                    </div>

                    <div>
                      <span className="text-xs text-slate-500">
                        تاريخ التسجيل
                      </span>
                      <div className="mt-1">
                        {date(item.userId?.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                  <h2 className="mb-4 text-xl font-black">بيانات الوثيقة</h2>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-slate-500">
                        الاسم في الوثيقة
                      </div>
                      <div className="mt-1 font-bold">{item.fullName || "—"}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">نوع الوثيقة</div>
                      <div className="mt-1 font-bold">
                        {item.documentType === "passport"
                          ? "جواز سفر"
                          : "هوية وطنية"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">
                        رقم الوثيقة
                      </div>
                      <div className="mt-1 font-bold">
                        {item.documentNumber || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">الجنسية</div>
                      <div className="mt-1 font-bold">
                        {item.nationality || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">
                        بلد الإصدار
                      </div>
                      <div className="mt-1 font-bold">
                        {item.issuingCountry || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">
                        تاريخ الميلاد
                      </div>
                      <div className="mt-1 font-bold">
                        {item.dateOfBirth || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-4">
                  <div className="mb-3 font-black">صورة الوثيقة</div>
                  <img
                    src={`/api/admin/kyc/file?id=${encodeURIComponent(
                      id
                    )}&type=document`}
                    alt="وثيقة الهوية"
                    className="max-h-[520px] w-full rounded-xl border border-slate-800 bg-black object-contain"
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-4">
                  <div className="mb-3 font-black">
                    Selfie مع الوثيقة
                  </div>
                  <img
                    src={`/api/admin/kyc/file?id=${encodeURIComponent(
                      id
                    )}&type=selfie`}
                    alt="Selfie مع الوثيقة"
                    className="max-h-[520px] w-full rounded-xl border border-slate-800 bg-black object-contain"
                  />
                </div>
              </div>
            </div>

            {item.status === "pending" ? (
              <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                <button
                  disabled={busy}
                  onClick={() => void review("approve")}
                  className="rounded-xl bg-emerald-600 px-7 py-3 font-black disabled:opacity-50"
                >
                  اعتماد التوثيق
                </button>

                <button
                  disabled={busy}
                  onClick={() => void review("reject")}
                  className="rounded-xl bg-red-600 px-7 py-3 font-black disabled:opacity-50"
                >
                  رفض الطلب
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                الحالة الحالية: <b>{item.status}</b>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AdminPageFrame>
  );
}