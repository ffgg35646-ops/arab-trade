"use client";

import { useEffect, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";

export default function ReferralPage() {
  const [commissionPercent, setCommissionPercent] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    try {
      const res = await fetch("/api/admin/referral", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "تعذر تحميل إعدادات الإحالة"
        );
      }

      setCommissionPercent(
        String(data.referral?.commissionPercent ?? 0)
      );

      setEnabled(
        data.referral?.enabled !== false
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "تعذر تحميل إعدادات الإحالة"
      );
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const value = Number(commissionPercent);

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      alert("نسبة العمولة يجب أن تكون بين 0 و100");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/admin/referral", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled,
          commissionPercent: value,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "تعذر حفظ إعدادات الإحالة"
        );
      }

      setCommissionPercent(
        String(
          data.referral?.commissionPercent ?? value
        )
      );

      setEnabled(
        data.referral?.enabled !== false
      );

      alert("تم حفظ إعدادات الإحالة");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "تعذر حفظ إعدادات الإحالة"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageFrame title="الإحالة">
      <div dir="rtl" className="mx-auto w-full max-w-3xl">
        <section className="rounded-2xl border border-slate-800 bg-[#08111e] p-6">
          <div className="mb-6">
            <h2 className="text-xl font-black">
              إعدادات الإحالة
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              تحكم في نسبة عمولة الإحالة وحالتها من مكان واحد.
            </p>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              جاري تحميل إعدادات الإحالة...
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-bold">
                  عمولة الإحالة
                </label>

                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={commissionPercent}
                    onChange={(e) =>
                      setCommissionPercent(e.target.value)
                    }
                    className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-4 pl-14 text-lg font-black outline-none"
                  />

                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                    %
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0b1422] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold">
                      نظام الإحالة
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      عند الإيقاف لا تُحتسب عمولات إحالة جديدة.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEnabled((v) => !v)}
                    className={`relative h-7 w-12 rounded-full transition ${
                      enabled
                        ? "bg-emerald-500"
                        : "bg-slate-700"
                    }`}
                    aria-label="حالة الإحالة"
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                        enabled
                          ? "right-1"
                          : "right-6"
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-3 text-sm font-black">
                  {enabled ? (
                    <span className="text-emerald-300">
                      مفعلة
                    </span>
                  ) : (
                    <span className="text-red-300">
                      متوقفة
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="w-full rounded-xl bg-blue-600 px-5 py-4 font-black disabled:opacity-50"
              >
                {saving
                  ? "جاري الحفظ..."
                  : "حفظ التغييرات"}
              </button>
            </div>
          )}
        </section>
      </div>
    </AdminPageFrame>
  );
}