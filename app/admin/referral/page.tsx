"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";
import {
  CheckCircle2,
  Loader2,
  Power,
  Save,
  Users,
} from "lucide-react";

interface ReferralSettings {
  commissionPercent: number;
  enabled: boolean;
}

interface ReferralStats {
  invitedCount: number;
  activeReferralCount: number;
  depositsByAsset: { asset: string; amount: number; deposits: number }[];
}

interface ReferralAccount {
  _id: string;
  name?: string;
  username?: string;
  email?: string;
  createdAt?: string;
  referrerName?: string;
  referrerUsername?: string;
  referrerEmail?: string;
  active: boolean;
  depositsByAsset: { asset: string; amount: number; deposits: number }[];
}

export default function ReferralPage() {
  const [settings, setSettings] = useState<ReferralSettings>({
    commissionPercent: 10,
    enabled: true,
  });
  const [stats, setStats] = useState<ReferralStats>({
    invitedCount: 0,
    activeReferralCount: 0,
    depositsByAsset: [],
  });
  const [referrals, setReferrals] = useState<ReferralAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSettings = useCallback(async () => {
    try {

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
      setStats({
        invitedCount: Number(result.stats?.invitedCount || 0),
        activeReferralCount: Number(result.stats?.activeReferralCount || 0),
        depositsByAsset: Array.isArray(result.stats?.depositsByAsset) ? result.stats.depositsByAsset : [],
      });
      setReferrals(Array.isArray(result.referrals) ? result.referrals : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل إعدادات الإحالة"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => { void loadSettings(); });
  }, [loadSettings]);

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
                  تابع نشاط الإحالات وتحكم في تشغيل النظام من مكان واحد.
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
            <section className="rounded-2xl border border-white/10 bg-[#08111e] p-5 md:p-6">
              <div className="mb-4">
                <h2 className="text-lg font-black">نشاط الإحالات والإيداعات المؤكدة</h2>
                <p className="mt-1 text-xs leading-6 text-slate-500">
                  تُعد الإحالة نشطة بعد اعتماد إيداع خارجي لحساب المستخدم المدعو. الأرصدة معروضة حسب العملة دون جمع عملات مختلفة.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#050a13] p-4">
                  <div className="text-xs text-slate-500">إجمالي المستخدمين المدعوين</div>
                  <div className="mt-2 text-2xl font-black">{stats.invitedCount}</div>
                </div>
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
                  <div className="text-xs text-slate-500">إحالات لديها إيداع معتمد</div>
                  <div className="mt-2 text-2xl font-black text-emerald-300">{stats.activeReferralCount}</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 text-xs font-bold text-slate-400">الإيداعات المعتمدة من الحسابات المدعوة</div>
                {stats.depositsByAsset.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">لا توجد إيداعات إحالة معتمدة حتى الآن.</div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stats.depositsByAsset.map((item) => (
                      <div key={item.asset} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#050a13] px-4 py-3">
                        <span className="text-xs font-bold text-cyan-200">{item.asset}</span>
                        <div className="text-left">
                          <div className="font-black">{new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(item.amount)}</div>
                          <div className="mt-1 text-[10px] text-slate-600">{item.deposits} إيداع معتمد</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="grid gap-5">
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

            <div className="rounded-2xl border border-white/10 bg-[#08111e] p-5 md:p-6">
              <div className="mb-4">
                <h2 className="text-lg font-black">سجل الإحالات حسب المستخدم</h2>
                <p className="mt-1 text-xs leading-6 text-slate-500">يعرض صاحب الإحالة، والحساب المدعو، وحالة النشاط وفق الإيداع الخارجي المعتمد. تُعرض القيم مفصّلة حسب العملة.</p>
              </div>
              {referrals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">لا توجد حسابات مرتبطة بإحالة حتى الآن.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full text-right text-sm">
                    <thead className="bg-[#050a13] text-xs text-slate-400">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3">المستخدم المدعو</th>
                        <th className="whitespace-nowrap px-4 py-3">صاحب الإحالة</th>
                        <th className="whitespace-nowrap px-4 py-3">الحالة</th>
                        <th className="whitespace-nowrap px-4 py-3">الإيداعات المعتمدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((item) => (
                        <tr key={item._id} className="border-t border-white/10 align-top">
                          <td className="px-4 py-3">
                            <div className="font-bold">{item.name || item.username || "مستخدم"}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.email || "—"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div>{item.referrerName || item.referrerUsername || "—"}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.referrerEmail || "—"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={item.active ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300" : "rounded-full bg-slate-700/40 px-3 py-1 text-xs font-bold text-slate-400"}>
                              {item.active ? "نشط — لديه إيداع معتمد" : "غير نشط"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {item.depositsByAsset.length === 0 ? <span className="text-xs text-slate-600">لا توجد إيداعات معتمدة</span> : item.depositsByAsset.map((deposit) => (
                              <div key={deposit.asset} className="mb-1 whitespace-nowrap text-xs">
                                <span className="font-bold text-cyan-300">{deposit.asset}</span>
                                {" · "}{new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(deposit.amount)}
                                {" · "}{deposit.deposits} إيداع
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
