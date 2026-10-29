"use client";

import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Users,
  Wallet,
  UserCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

interface ReferralUser {
  _id: string;
  name: string;
  username?: string;
  email?: string;
  createdAt: string;
  active: boolean;
  depositsByAsset: { asset: string; amount: number; count: number }[];
}

interface CommissionSummary {
  asset: string;
  total: number;
  pending: number;
  available: number;
  paid: number;
  count: number;
}

interface ReferralData {
  code: string;
  link: string;
  invited: number;
  active: number;
  enabled: boolean;
  commissionPercent: number;
  referrals: ReferralUser[];
  commissionsByAsset: CommissionSummary[];
}

export default function ReferralPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadReferralData() {
      try {
        const response = await fetch("/api/referral", {
          cache: "no-store",
          credentials: "include",
        });
        const result = await response.json();

        if (!response.ok || !result.success || !result.referral) {
          throw new Error(result.message || "تعذر تحميل بيانات الإحالة");
        }

        if (!cancelled) {
          setData(result.referral as ReferralData);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل بيانات الإحالة"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReferralData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function copyReferralLink() {
    if (!data?.link || typeof window === "undefined") return;

    const fullLink = window.location.origin + data.link;

    try {
      await navigator.clipboard.writeText(fullLink);
      setCopied(true);
      setCopyMessage("تم نسخ رابط الإحالة بنجاح");
      window.setTimeout(() => setCopied(false), 2200);
      window.setTimeout(() => setCopyMessage(""), 3000);
    } catch {
      setError("تعذر نسخ الرابط تلقائيًا. يمكنك تحديد الرابط ونسخه يدويًا.");
    }
  }

  const fullLink =
    data && typeof window !== "undefined"
      ? window.location.origin + data.link
      : data?.link || "";

  function formatAmount(value: number) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(Number(value || 0));
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "Africa/Cairo",
    });
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-w-0 flex-1 bg-[#050a13] text-white">
          <div className="p-4 md:p-6 lg:p-8">
            <section className="rounded-3xl border border-white/10 bg-gradient-to-l from-blue-500/[0.14] via-[#07101d] to-cyan-400/[0.04] p-6 md:p-8">
              <div className="grid gap-7 xl:grid-cols-[1.2fr_0.9fr] xl:items-center">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] text-cyan-300">
                    <Users size={14} />
                    ARAB TRADE · REFERRALS
                  </div>
                  <h1 className="mt-3 text-3xl font-black md:text-4xl">
                    برنامج الإحالة
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
                    شارك رابطك مع أصدقائك وتابع الحسابات التي انضمت من خلالك
                    وعمولات الإحالة المسجلة لحسابك.
                  </p>
                  {!loading && data && !data.enabled && (
                    <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-sm text-amber-200">
                      نظام الإحالات متوقف حاليًا؛ لن تُحتسب عمولات جديدة أثناء التوقف.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#050a13]/75 p-5 md:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">رابط الدعوة الخاص بك</div>
                      <h2 className="mt-1 text-lg font-bold">ادعُ أصدقاءك</h2>
                    </div>
                    <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/10 p-3 text-cyan-300">
                      <Link2 size={20} />
                    </div>
                  </div>

                  {loading ? (
                    <div className="mt-5 min-h-[4rem]" aria-hidden="true" />
                  ) : data ? (
                    <>
                      <div className="mt-5 break-all rounded-xl border border-white/10 bg-[#07101d] px-4 py-3 text-left font-mono text-xs leading-6 text-slate-300" dir="ltr">
                        {fullLink}
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyReferralLink()}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black transition hover:bg-blue-500"
                      >
                        {copied ? <Check size={17} /> : <Copy size={17} />}
                        {copied ? "تم النسخ" : "نسخ رابط الإحالة"}
                      </button>
                      {copyMessage && (
                        <p aria-live="polite" className="mt-3 text-xs text-emerald-300">
                          {copyMessage}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
                        <span className="text-xs text-slate-500">كود الإحالة</span>
                        <span dir="ltr" className="font-mono text-sm font-bold tracking-wider text-cyan-300">
                          {data.code || "—"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-300">
                      تعذر تحميل رابط الإحالة.
                    </div>
                  )}
                </div>
              </div>
            </section>

            {error && (
              <div role="alert" className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[0.07] px-5 py-4 text-sm text-red-300">
                {error}
              </div>
            )}

            {loading ? (
              <div className="mt-6 min-h-40" aria-hidden="true" />
            ) : data ? (
              <>
                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">إجمالي المدعوين</span>
                      <Users size={18} className="text-cyan-300" />
                    </div>
                    <div className="mt-4 text-3xl font-black">{data.invited}</div>
                    <p className="mt-2 text-xs text-slate-600">كل الحسابات المرتبطة بكودك</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">الحسابات النشطة</span>
                      <UserCheck size={18} className="text-emerald-300" />
                    </div>
                    <div className="mt-4 text-3xl font-black">{data.active}</div>
                    <p className="mt-2 text-xs text-slate-600">من المستخدمين الذين دعوتهم</p>
                  </div>


                  <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">إجمالي العمولات</span>
                      <Wallet size={18} className="text-blue-300" />
                    </div>
                    {data.commissionsByAsset.length ? (
                      <div className="mt-3 space-y-2">
                        {data.commissionsByAsset.map((item) => (
                          <div key={item.asset} className="flex items-center justify-between gap-3">
                            <span className="text-xs text-slate-500">{item.asset}</span>
                            <span className="text-lg font-bold">
                              {formatAmount(item.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 text-sm font-semibold text-slate-400">
                        لا توجد عمولات مسجلة بعد
                      </div>
                    )}
                    <p className="mt-2 text-xs text-slate-600">تُعرض كل عملة بشكل منفصل</p>
                  </div>
                </div>

                <section className="mt-6 rounded-2xl border border-white/10 bg-[#07101d] p-5 md:p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">المستخدمون الذين دعوتهم</h2>
                      <p className="mt-1 text-xs leading-6 text-slate-500">
                        أحدث الحسابات المسجلة من خلال رابط الإحالة الخاص بك.
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                      {data.invited} مستخدم
                    </div>
                  </div>

                  {data.referrals.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-[#050a13]/60 px-5 py-10 text-center">
                      <Users size={24} className="mx-auto text-slate-600" />
                      <p className="mt-3 font-bold text-slate-300">لسه مفيش إحالات</p>
                      <p className="mt-2 text-xs leading-6 text-slate-500">
                        شارك رابطك مع أصدقائك، وهتظهر الحسابات الجديدة هنا.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-right text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-xs text-slate-500">
                            <th className="px-3 py-3 font-semibold">المستخدم</th>
                            <th className="px-3 py-3 font-semibold">تاريخ التسجيل</th>
                            <th className="px-3 py-3 font-semibold">الإيداع الخارجي المعتمد</th>
                            <th className="px-3 py-3 font-semibold">الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.referrals.map((referral) => (
                            <tr key={referral._id} className="border-b border-white/5 last:border-0">
                              <td className="px-3 py-4">
                                <div className="font-bold text-slate-100">{referral.name || referral.username || "مستخدم"}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {referral.email || (referral.username ? "@" + referral.username : "—")}
                                </div>
                              </td>
                              <td className="px-3 py-4 text-xs text-slate-400">
                                {formatDate(referral.createdAt)}
                              </td>
                              <td className="px-3 py-4">
                                {referral.depositsByAsset?.length ? (
                                  <div className="space-y-1.5">
                                    {referral.depositsByAsset.map((item) => (
                                      <div key={item.asset} className="text-xs text-slate-300">
                                        <span className="font-bold text-cyan-200">{new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(item.amount)}</span>{" "}
                                        <span className="text-slate-500">{item.asset}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-600">لا يوجد إيداع معتمد</span>
                                )}
                              </td>
                              <td className="px-3 py-4">
                                <span className={referral.active ? "inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300" : "inline-flex rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-400"}>
                                  {referral.active ? "نشط" : "غير نشط"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {data.invited > data.referrals.length && (
                    <p className="mt-4 text-xs text-slate-600">
                      يتم عرض أحدث {data.referrals.length} إحالة من إجمالي {data.invited}.
                    </p>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </>
  );
}
