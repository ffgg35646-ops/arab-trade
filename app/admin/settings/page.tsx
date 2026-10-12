"use client";

import { useEffect, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";
import AdminDataPage from "@/components/AdminDataPage";

type Support = {
  email: string;
  facebook: string;
  telegram: string;
};

type FinancialLimits = {
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  minGeneralWithdrawal: number;
  maxWithdrawal: number;
  dailyWithdrawalLimit: number;
};

export default function Page() {
  const [open, setOpen] = useState(false);

  const [support, setSupport] = useState<Support>({
    email: "",
    facebook: "",
    telegram: "",
  });

  const [loadingSupport, setLoadingSupport] = useState(true);
  const [withdrawalRules, setWithdrawalRules] = useState({ firstPackageWithdrawalPercent: 100, referralPackageWithdrawalPercent: 50 });
  const [loadingWithdrawalRules, setLoadingWithdrawalRules] = useState(true);
  const [savingWithdrawalRules, setSavingWithdrawalRules] = useState(false);
  const [savingSupport, setSavingSupport] = useState(false);
  const [financialLimits, setFinancialLimits] = useState<FinancialLimits>({ minDeposit: 10, maxDeposit: 100000, minWithdrawal: 50, minGeneralWithdrawal: 50, maxWithdrawal: 50000, dailyWithdrawalLimit: 100000 });
  const [savingFinancialLimits, setSavingFinancialLimits] = useState(false);

  async function loadSupport() {
    try {
      const res = await fetch("/api/admin/support", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(
          json?.message || "تعذر تحميل بيانات الدعم"
        );
      }

      setSupport({
        email: json.support?.email || "",
        facebook: json.support?.facebook || "",
        telegram: json.support?.telegram || "",
      });
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "تعذر تحميل بيانات الدعم"
      );
    } finally {
      setLoadingSupport(false);
    }
  }

  async function loadWithdrawalRules() {
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.message || "تعذر تحميل إعدادات السحب");
      setWithdrawalRules({
        firstPackageWithdrawalPercent: Number(json.settings?.withdrawals?.firstPackageWithdrawalPercent ?? 100),
        referralPackageWithdrawalPercent: Number(json.settings?.withdrawals?.referralPackageWithdrawalPercent ?? 50),
      });
      setFinancialLimits({
        minDeposit: Number(json.settings?.deposits?.minAmount ?? 10),
        maxDeposit: Number(json.settings?.deposits?.maxAmount ?? 100000),
        minWithdrawal: Number(json.settings?.withdrawals?.minAmount ?? 50),
        minGeneralWithdrawal: Number(json.settings?.withdrawals?.minGeneralWithdrawal ?? json.settings?.withdrawals?.minAmount ?? 50),
        maxWithdrawal: Number(json.settings?.withdrawals?.maxAmount ?? 50000),
        dailyWithdrawalLimit: Number(json.settings?.withdrawals?.dailyLimit ?? 100000),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحميل إعدادات السحب");
    } finally {
      setLoadingWithdrawalRules(false);
    }
  }

  async function saveWithdrawalRules() {
    setSavingWithdrawalRules(true);
    try {
      const first = Number(withdrawalRules.firstPackageWithdrawalPercent);
      const referral = Number(withdrawalRules.referralPackageWithdrawalPercent);
      if (![first, referral].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
        throw new Error("النسب يجب أن تكون بين 0 و100");
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawals: {
          firstPackageWithdrawalPercent: first,
          referralPackageWithdrawalPercent: referral,
        } }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.message || "تعذر حفظ إعدادات السحب");
      setWithdrawalRules({
        firstPackageWithdrawalPercent: Number(json.settings?.withdrawals?.firstPackageWithdrawalPercent ?? first),
        referralPackageWithdrawalPercent: Number(json.settings?.withdrawals?.referralPackageWithdrawalPercent ?? referral),
      });
      alert("تم حفظ نسب سحب الباقات");
    } catch (error) {
      alert(error instanceof Error ? error.message : "حدث خطأ أثناء حفظ إعدادات السحب");
    } finally {
      setSavingWithdrawalRules(false);
    }
  }

  async function saveFinancialLimits() {
    setSavingFinancialLimits(true);
    try {
      const values = Object.values(financialLimits);
      if (!values.every((value) => Number.isFinite(value) && value >= 0)) {
        throw new Error("اكتب حدودًا رقمية صحيحة لا تقل عن صفر");
      }
      if (financialLimits.maxDeposit > 0 && financialLimits.minDeposit > financialLimits.maxDeposit) {
        throw new Error("الحد الأدنى للإيداع لا يمكن أن يتجاوز الحد الأقصى");
      }
      if (financialLimits.maxWithdrawal > 0 && financialLimits.minWithdrawal > financialLimits.maxWithdrawal) {
        throw new Error("الحد الأدنى للسحب لا يمكن أن يتجاوز الحد الأقصى");
      }
      if (financialLimits.maxWithdrawal > 0 && financialLimits.minGeneralWithdrawal > financialLimits.maxWithdrawal) {
        throw new Error("الحد الأدنى للسحب العام لا يمكن أن يتجاوز الحد الأقصى للسحب");
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deposits: { minAmount: financialLimits.minDeposit, maxAmount: financialLimits.maxDeposit },
          withdrawals: { minAmount: financialLimits.minWithdrawal, minGeneralWithdrawal: financialLimits.minGeneralWithdrawal, maxAmount: financialLimits.maxWithdrawal, dailyLimit: financialLimits.dailyWithdrawalLimit },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر حفظ حدود الإيداع والسحب");
      setFinancialLimits({
        minDeposit: Number(json.settings?.deposits?.minAmount ?? financialLimits.minDeposit),
        maxDeposit: Number(json.settings?.deposits?.maxAmount ?? financialLimits.maxDeposit),
        minWithdrawal: Number(json.settings?.withdrawals?.minAmount ?? financialLimits.minWithdrawal),
        minGeneralWithdrawal: Number(json.settings?.withdrawals?.minGeneralWithdrawal ?? financialLimits.minGeneralWithdrawal),
        maxWithdrawal: Number(json.settings?.withdrawals?.maxAmount ?? financialLimits.maxWithdrawal),
        dailyWithdrawalLimit: Number(json.settings?.withdrawals?.dailyLimit ?? financialLimits.dailyWithdrawalLimit),
      });
      alert("تم حفظ حدود الإيداع والسحب");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ الحدود المالية");
    } finally {
      setSavingFinancialLimits(false);
    }
  }

  useEffect(() => {
    void loadSupport();
    void loadWithdrawalRules();
  }, []);

  async function saveSupport() {
    setSavingSupport(true);

    try {
      const res = await fetch("/api/admin/support", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(support),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(
          json?.message || "تعذر حفظ بيانات الدعم"
        );
      }

      setSupport({
        email: json.support?.email || "",
        facebook: json.support?.facebook || "",
        telegram: json.support?.telegram || "",
      });

      alert("تم حفظ بيانات الدعم");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء الحفظ"
      );
    } finally {
      setSavingSupport(false);
    }
  }

  return (
    <AdminPageFrame title="إعدادات المنصة">
      <div dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col items-center space-y-4">
        <AdminDataPage
          title="إعدادات المنصة"
          endpoint="/api/admin/settings"
        />

        <section className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-[#08111e] p-5">
          <h2 className="text-lg font-black">الحدود العامة للإيداع والسحب</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">تُطبّق الحدود العامة على طلبات المستخدم، بالإضافة إلى الحدود الخاصة بكل وسيلة دفع أو شبكة.</p>
          {loadingWithdrawalRules ? <p className="py-4 text-sm text-slate-500">جاري تحميل الحدود المالية...</p> : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {([
                ["minDeposit", "الحد الأدنى للإيداع"],
                ["maxDeposit", "الحد الأقصى للإيداع"],
                ["minWithdrawal", "الحد الأدنى للسحب"],
                ["minGeneralWithdrawal", "الحد الأدنى للسحب العام"],
                ["maxWithdrawal", "الحد الأقصى للسحب"],
                ["dailyWithdrawalLimit", "الحد اليومي الإجمالي للسحب"],
              ] as const).map(([key, label]) => (
                <label key={key} className="block text-sm font-bold">{label} (USDT)
                  <input type="number" min="0" step="any" value={financialLimits[key]}
                    onChange={(e) => setFinancialLimits((current) => ({ ...current, [key]: Number(e.target.value) }))}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-white outline-none" />
                </label>
              ))}
            </div>
          )}
          <button type="button" disabled={loadingWithdrawalRules || savingFinancialLimits} onClick={() => void saveFinancialLimits()}
            className="mt-4 w-full rounded-xl bg-cyan-600 px-5 py-3 font-black text-slate-950 disabled:opacity-50">
            {savingFinancialLimits ? "جاري حفظ الحدود..." : "حفظ الحدود العامة"}
          </button>
        </section>

        <section className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-[#08111e] p-5">
          <h2 className="text-lg font-black">حدود سحب أرباح الباقات</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">السحب الأول لا يحتاج إحالات نشطة، وحده الافتراضي 100% من قيمة تفعيل الباقة. السحوبات التالية تعتمد على إجمالي الإيداعات الخارجية المعتمدة للإحالات النشطة، والنسبة الافتراضية 50%، مع خصم السحوبات السابقة من هذا الحد.</p>
          {loadingWithdrawalRules ? <p className="py-4 text-sm text-slate-500">جاري تحميل إعدادات السحب...</p> : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold">نسبة حد السحب الأول (%)
                <input type="number" min="0" max="100" step="1" value={withdrawalRules.firstPackageWithdrawalPercent}
                  onChange={(e) => setWithdrawalRules((current) => ({ ...current, firstPackageWithdrawalPercent: Number(e.target.value) }))}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-white outline-none" />
              </label>
              <label className="block text-sm font-bold">نسبة حد السحوبات التالية مقابل إيداعات الإحالات النشطة (%)
                <input type="number" min="0" max="100" step="1" value={withdrawalRules.referralPackageWithdrawalPercent}
                  onChange={(e) => setWithdrawalRules((current) => ({ ...current, referralPackageWithdrawalPercent: Number(e.target.value) }))}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-white outline-none" />
              </label>
            </div>
          )}
          <button type="button" disabled={loadingWithdrawalRules || savingWithdrawalRules} onClick={() => void saveWithdrawalRules()}
            className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 font-black disabled:opacity-50">
            {savingWithdrawalRules ? "جاري الحفظ..." : "حفظ نسب السحب"}
          </button>
        </section>

        <div className="flex w-full justify-center">
          <section className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-right"
          >
            <div>
              <div className="text-lg font-black">
                الدعم
              </div>

              <div className="mt-1 text-xs text-slate-500">
                بيانات التواصل التي تظهر في صفحة الدعم للمستخدم
              </div>
            </div>

            <span className="text-xl text-slate-400">
              {open ? "−" : "+"}
            </span>
          </button>

          {open ? (
            <div className="border-t border-slate-800 p-5">
              {loadingSupport ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  جاري تحميل بيانات الدعم...
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      البريد الإلكتروني
                    </label>

                    <input
                      type="email"
                      value={support.email}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          email: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      فيسبوك
                    </label>

                    <input
                      value={support.facebook}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          facebook: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      تيليجرام
                    </label>

                    <input
                      value={support.telegram}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          telegram: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={savingSupport}
                    onClick={() => void saveSupport()}
                    className="w-full rounded-xl bg-blue-600 px-5 py-3 font-black disabled:opacity-50"
                  >
                    {savingSupport
                      ? "جاري الحفظ..."
                      : "حفظ بيانات الدعم"}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          </section>
        </div>
      </div>
    </AdminPageFrame>
  );
}