"use client";

import { useEffect, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";
import {
  CheckCircle2,
  Loader2,
  Percent,
  Power,
  Save,
  Users,
} from "lucide-react";

interface ReferralSettings {
  commissionPercent: number;
  enabled: boolean;
}

export default function ReferralPage() {
  const [settings, setSettings] = useState<ReferralSettings>({
    commissionPercent: 10,
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/admin/referral", {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "تعذر تحميل إعدادات الإحالة");
      }

      setSettings({
        commissionPercent: Number(result.referral?.commissionPercent ?? 10),
        enabled: result.referral?.enabled !== false,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل إعدادات الإحالة"
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    const commissionPercent = Number(settings.commissionPercent);

    if (
      !Number.isFinite(commissionPercent) ||
      commissionPercent < 0 ||
      commissionPercent > 100
    ) {
      setError("نسبة عمولة الإحالة يجب أن تكون بين 0% و100%.");
      setMessage("");
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      setError("");

      const response = await fetch("/api/admin/referral", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: settings.enabled,
          commissionPercent,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "تعذر حفظ إعدادات الإحالة");
      }

      setSettings({
        commissionPercent: Number(
          result.referral?.commissionPercent ?? commissionPercent
        ),
        enabled: result.referral?.enabled !== false,
      });
      setMessage("تم حفظ إعدادات الإحالة بنجاح.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "تعذر حفظ إعدادات الإحالة"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageFrame title="الإحالات">
      <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-l from-blue-500/[0.14] via-[#08111e] to-cyan-400/[0.04] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-3 text-cyan-300">
                <Users size={26} />
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-[0.2em] text-cyan-300">
                  ARAB TRADE · ADMIN CONTROL
                </div>
                <h1 className="mt-2 text-2xl font-black md:text-3xl">
                  إعدادات الإحالات
                </h1>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  تحكم في نسبة العمولة وتشغيل نظام الإحالات من مكان واحد.
                </p>
              </div>
            </div>

            <div className={settings.enabled ? "inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-2 text-xs font-bold text-emerald-300" : "inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-400/[0.08] px-4 py-2 text-xs font-bold text-red-300"}>
              <span className={settings.enabled ? "h-2 w-2 rounded-full bg-emerald-400" : "h-2 w-2 rounded-full bg-red-400"} />
              {settings.enabled ? "نظام الإحالات مفعّل" : "نظام الإحالات متوقف"}
            </div>
          </div>
        </section>

        {message && (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-5 py-4 text-sm text-emerald-300">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#08111e] text-sm text-slate-400">
            <Loader2 size={21} className="animate-spin text-cyan-300" />
            جاري تحميل إعدادات الإحالة...
          </div>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-[#08111e] p-6 md:p-7">
                <div className="mb-5 flex items-center gap-3">
                  <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/10 p-2.5 text-cyan-300">
                    <Percent size={20} />
                  </div>
                  <div>
                    <h2 className="font-black">نسبة عمولة الإحالة</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      النسبة التي يعتمد عليها النظام عند احتساب العمولة.
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={settings.commissionPercent}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        commissionPercent: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-[#050a13] px-4 py-4 pl-14 text-2xl font-black outline-none transition focus:border-cyan-400/50"
                    aria-label="نسبة عمولة الإحالة"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-cyan-300">
                    %
                  </span>
                </div>
                <p className="mt-3 text-xs leading-6 text-slate-500">
                  أدخل قيمة من 0 إلى 100. التعديل يُحفظ عند الضغط على زر الحفظ.
                </p>
              </section>

              <section className="rounded-2xl border border-white/10 bg-[#08111e] p-6 md:p-7">
                <div className="mb-5 flex items-center gap-3">
                  <div className={settings.enabled ? "rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2.5 text-emerald-300" : "rounded-xl border border-slate-700 bg-slate-800/60 p-2.5 text-slate-400"}>
                    <Power size={20} />
                  </div>
                  <div>
                    <h2 className="font-black">حالة نظام الإحالات</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      أوقفه لمنع احتساب عمولات إحالة جديدة.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      enabled: !current.enabled,
                    }))
                  }
                  aria-pressed={settings.enabled}
                  className={settings.enabled ? "flex w-full items-center justify-between gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-5 text-right transition hover:bg-emerald-400/[0.1]" : "flex w-full items-center justify-between gap-4 rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-5 text-right transition hover:bg-red-400/[0.08]"}
                >
                  <div>
                    <div className={settings.enabled ? "font-black text-emerald-300" : "font-black text-red-300"}>
                      {settings.enabled ? "النظام يعمل" : "النظام متوقف"}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-slate-500">
                      {settings.enabled
                        ? "يمكن احتساب عمولات الإحالة وفق إعدادات المنصة."
                        : "لن تُحتسب عمولات إحالة جديدة عند إيقاف النظام."}
                    </div>
                  </div>
                  <div className={settings.enabled ? "relative h-7 w-12 shrink-0 rounded-full bg-emerald-500 transition" : "relative h-7 w-12 shrink-0 rounded-full bg-slate-700 transition"}>
                    <span className={settings.enabled ? "absolute right-1 top-1 h-5 w-5 rounded-full bg-white transition" : "absolute right-6 top-1 h-5 w-5 rounded-full bg-white transition"} />
                  </div>
                </button>
              </section>
            </div>

            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={saving}
                className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-4 font-black transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <Save size={19} />
                )}
                {saving ? "جاري الحفظ..." : "حفظ إعدادات الإحالة"}
              </button>
            </div>
          </>
        )}
      </div>
    </AdminPageFrame>
  );
}
