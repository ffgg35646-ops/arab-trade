"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import Link from "next/link";
import { useEffect, useState } from "react";

function date(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("en-US");
}

export default function KycDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
        const res = await fetch("/api/admin/kyc/" + encodeURIComponent(id), {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || "تعذر تحميل الطلب");
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
      reason = window.prompt("اكتب سبب رفض طلب التسجيل:") || "";
      if (!reason.trim()) return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/kyc", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "تعذر تنفيذ المراجعة");
      alert(json?.message || "تم التنفيذ");
      window.location.href = "/admin/kyc";
    } catch (e) {
      alert(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  const imageUrl = (type: "document" | "documentBack" | "selfie") =>
    "/api/admin/kyc/file?id=" + encodeURIComponent(id) + "&type=" + type;

  return (
    <AdminPageFrame title="مراجعة إنشاء الحساب والهوية">
      <div dir="rtl">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-500">
            جاري تحميل الطلب...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-red-300">{error}</div>
        ) : item ? (
          <div className="space-y-5">
            <Link
              href="/admin/kyc"
              className="inline-flex rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm font-bold"
            >
              ← العودة لطلبات المراجعة
            </Link>

            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                  <h2 className="mb-4 text-xl font-black">بيانات الحساب</h2>
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-slate-500">الاسم عند إنشاء الحساب</span>
                      <div className="mt-1 font-black">{item.userId?.name || "—"}</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">اسم المستخدم</span>
                      <div className="mt-1">{item.userId?.username || "—"}</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">البريد الإلكتروني</span>
                      <div className="mt-1">{item.userId?.email || "—"}</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">تاريخ التسجيل</span>
                      <div className="mt-1">{date(item.userId?.createdAt)}</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">حالة الحساب</span>
                      <div className="mt-1 font-bold">
                        {item.userId?.approvalStatus === "pending"
                          ? "بانتظار موافقة الإدارة"
                          : item.userId?.approvalStatus === "approved"
                            ? "مقبول"
                            : item.userId?.approvalStatus === "rejected"
                              ? "مرفوض"
                              : "طلب هوية"}
                      </div>
                    </div>
                    {item.userId?.rejectionReason ? (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                        سبب الرفض السابق: {item.userId.rejectionReason}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                  <h2 className="mb-4 text-xl font-black">بيانات الطلب</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-slate-500">الاسم في الطلب</div>
                      <div className="mt-1 font-bold">{item.fullName || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">نوع الوثيقة</div>
                      <div className="mt-1 font-bold">{item.documentType === "passport" ? "جواز سفر" : "هوية وطنية"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">رقم الوثيقة</div>
                      <div className="mt-1 font-bold">{item.documentNumber || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">الجنسية</div>
                      <div className="mt-1 font-bold">{item.nationality || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">بلد الإصدار</div>
                      <div className="mt-1 font-bold">{item.issuingCountry || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">تاريخ الميلاد</div>
                      <div className="mt-1 font-bold">{item.dateOfBirth || "—"}</div>
                    </div>
                  </div>
                </div>
              </div>

              {item.status === "pending" ? (
                <div className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-4">
                    <div className="mb-3 font-black">الوجه الأمامي للهوية</div>
                    <img
                      src={imageUrl("document")}
                      alt="الوجه الأمامي للهوية"
                      className="max-h-[420px] w-full rounded-xl border border-slate-800 bg-black object-contain"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-4">
                    <div className="mb-3 font-black">الوجه الخلفي للهوية</div>
                    {item.identityBackMime ? (
                      <img
                        src={imageUrl("documentBack")}
                        alt="الوجه الخلفي للهوية"
                        className="max-h-[420px] w-full rounded-xl border border-slate-800 bg-black object-contain"
                      />
                    ) : (
                      <p className="text-sm text-slate-500">لا توجد صورة للوجه الخلفي في طلب التوثيق القديم.</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-4 md:col-span-2 xl:col-span-1">
                    <div className="mb-3 font-black">صورة الشخص وهو ممسك بالهوية</div>
                    <img
                      src={imageUrl("selfie")}
                      alt="صورة الشخص وهو ممسك بالهوية"
                      className="max-h-[420px] w-full rounded-xl border border-slate-800 bg-black object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5 text-sm leading-7 text-slate-400">
                  تمت مراجعة الطلب وحُذفت صور الهوية بعد القرار للحفاظ على خصوصية البيانات.
                </div>
              )}
            </div>

            {item.status === "pending" ? (
              <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                <button
                  disabled={busy}
                  onClick={() => void review("approve")}
                  className="rounded-xl bg-emerald-600 px-7 py-3 font-black disabled:opacity-50"
                >
                  قبول التسجيل وتفعيل الحساب
                </button>
                <button
                  disabled={busy}
                  onClick={() => void review("reject")}
                  className="rounded-xl bg-red-600 px-7 py-3 font-black disabled:opacity-50"
                >
                  رفض التسجيل
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-5">
                الحالة الحالية: <b>{item.status}</b>
                {item.rejectionReason ? (
                  <p className="mt-2 text-sm text-red-300">سبب الرفض: {item.rejectionReason}</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AdminPageFrame>
  );
}
