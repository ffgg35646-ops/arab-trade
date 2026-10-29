"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function date(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-US");
}

export default function AdminKycPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [status, setStatus] = useState("pending");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/kyc?status=${encodeURIComponent(status)}&sort=${sort}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || "تعذر تحميل طلبات التوثيق");
      }

      setRequests(json.requests || []);
    } catch (e) {
      alert(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, [status, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    let reason = "";

    if (action === "reject") {
      reason =
        window.prompt(
          "اكتب سبب رفض طلب التوثيق:",
          "الوثائق غير واضحة أو غير مكتملة"
        ) || "";

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
        throw new Error(json?.message || "تعذر تحديث الطلب");
      }

      setSelected(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageFrame title="طلبات التوثيق">
      <div dir="rtl" className="space-y-5">
        <div className="flex flex-wrap gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3"
          >
            <option value="pending">قيد المراجعة</option>
            <option value="approved">معتمد</option>
            <option value="rejected">مرفوض</option>
            <option value="all">كل الطلبات</option>
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3"
          >
            <option value="newest">الأحدث أولًا</option>
            <option value="oldest">الأقدم أولًا</option>
          </select>

          <button
            onClick={() => void load()}
            className="rounded-xl bg-blue-600 px-5 py-3 font-bold"
          >
            تحديث
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              جاري تحميل الطلبات...
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              لا توجد طلبات.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="border-b border-slate-800 bg-[#0c1726]">
                  <tr>
                    <th className="px-4 py-4">المستخدم</th>
                    <th className="px-4 py-4">الاسم</th>
                    <th className="px-4 py-4">الوثيقة</th>
                    <th className="px-4 py-4">الحالة</th>
                    <th className="px-4 py-4">التاريخ</th>
                    <th className="px-4 py-4">الإجراء</th>
                  </tr>
                </thead>

                <tbody>
                  {requests.map((item) => (
                    <tr
                      key={item._id}
                      className="border-b border-slate-800/70 last:border-0"
                    >
                      <td className="px-4 py-4">
                        {item.userId?.email || "—"}
                      </td>
                      <td className="px-4 py-4">
                        {item.fullName || "—"}
                      </td>
                      <td className="px-4 py-4">
                        {item.documentType === "passport"
                          ? "جواز سفر"
                          : "هوية وطنية"}
                      </td>
                      <td className="px-4 py-4">{item.status}</td>
                      <td className="px-4 py-4">
                        {date(item.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/kyc/${item._id}`}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold"
                        >
                          فتح الطلب
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
            <div className="mx-auto max-w-5xl rounded-2xl border border-slate-800 bg-[#08111e] p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-black">مراجعة طلب التوثيق</h2>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg border border-slate-700 px-4 py-2"
                >
                  إغلاق
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["المستخدم", selected.userId?.email],
                  ["الاسم", selected.fullName],
                  ["تاريخ الميلاد", selected.dateOfBirth],
                  ["الجنسية", selected.nationality],
                  ["نوع الوثيقة", selected.documentType],
                  ["رقم الوثيقة", selected.documentNumber],
                  ["بلد الإصدار", selected.issuingCountry],
                  ["تاريخ الإصدار", selected.issueDate],
                  ["تاريخ الانتهاء", selected.expiryDate],
                  ["تاريخ الطلب", date(selected.createdAt)],
                ].map(([name, value]) => (
                  <div
                    key={String(name)}
                    className="rounded-xl border border-slate-800 bg-[#0b1422] p-4"
                  >
                    <div className="text-xs text-slate-500">{name}</div>
                    <div className="mt-2 font-bold">{value || "—"}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="mb-2 font-bold">الوثيقة</div>
                  <img
                    src={`/api/admin/kyc/file?id=${encodeURIComponent(
                      selected._id
                    )}&type=document`}
                    alt="وثيقة الهوية"
                    className="max-h-[500px] w-full rounded-xl border border-slate-800 object-contain bg-black"
                  />
                </div>

                <div>
                  <div className="mb-2 font-bold">Selfie مع الوثيقة</div>
                  <img
                    src={`/api/admin/kyc/file?id=${encodeURIComponent(
                      selected._id
                    )}&type=selfie`}
                    alt="Selfie مع الوثيقة"
                    className="max-h-[500px] w-full rounded-xl border border-slate-800 object-contain bg-black"
                  />
                </div>
              </div>

              {selected.status === "pending" ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    disabled={busy}
                    onClick={() => void review(selected._id, "approve")}
                    className="rounded-xl bg-emerald-600 px-6 py-3 font-black disabled:opacity-50"
                  >
                    اعتماد التوثيق
                  </button>

                  <button
                    disabled={busy}
                    onClick={() => void review(selected._id, "reject")}
                    className="rounded-xl bg-red-600 px-6 py-3 font-black disabled:opacity-50"
                  >
                    رفض الطلب
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </AdminPageFrame>
  );
}