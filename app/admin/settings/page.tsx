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
};

export default function Page() {
  const [open, setOpen] = useState(false);

  const [support, setSupport] = useState<Support>({
    email: "",
    facebook: "",
    telegram: "",
  });

  const [loadingSupport, setLoadingSupport] = useState(true);
  const [savingSupport, setSavingSupport] = useState(false);
  const [financialLimits, setFinancialLimits] = useState<FinancialLimits>({ minDeposit: 10, maxDeposit: 100000 });
  const [loadingFinancialLimits, setLoadingFinancialLimits] = useState(true);
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

  async function loadFinancialLimits() {
    try {
      const response = await fetch("/api/admin/settings", { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json?.message || "تعذر تحميل حدود الإيداع");
      setFinancialLimits({
        minDeposit: Number(json.settings?.deposits?.minAmount ?? 10),
        maxDeposit: Number(json.settings?.deposits?.maxAmount ?? 100000),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحميل حدود الإيداع");
    } finally {
      setLoadingFinancialLimits(false);
    }
  }

  async function saveFinancialLimits() {
    setSavingFinancialLimits(true);
    try {
      const values = Object.values(financialLimits);
      if (!values.every((value) => Number.isFinite(value) && value >= 0)) {
        throw new Error("اكتب حدود إيداع رقمية صحيحة لا تقل عن صفر");
      }
      if (financialLimits.maxDeposit > 0 && financialLimits.minDeposit > financialLimits.maxDeposit) {
        throw new Error("الحد الأدنى للإيداع لا يمكن أن يتجاوز الحد الأقصى");
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposits: { minAmount: financialLimits.minDeposit, maxAmount: financialLimits.maxDeposit } }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر حفظ حدود الإيداع");
      setFinancialLimits({
        minDeposit: Number(json.settings?.deposits?.minAmount ?? financialLimits.minDeposit),
        maxDeposit: Number(json.settings?.deposits?.maxAmount ?? financialLimits.maxDeposit),
      });
      alert("تم حفظ حدود الإيداع");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ حدود الإيداع");
    } finally {
      setSavingFinancialLimits(false);
    }
  }

  useEffect(() => {
    void loadSupport();
    void loadFinancialLimits();
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
          <h2 className="text-lg font-black">حدود الإيداع</h2>
          {loadingFinancialLimits ? <div className="min-h-[6rem]" aria-hidden="true" /> : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {([
                ["minDeposit", "الحد الأدنى للإيداع"],
                ["maxDeposit", "الحد الأقصى للإيداع"],
              ] as const).map(([key, label]) => (
                <label key={key} className="block text-sm font-bold">{label} (USDT)
                  <input type="number" min="0" step="any" value={financialLimits[key]}
                    onChange={(e) => setFinancialLimits((current) => ({ ...current, [key]: Number(e.target.value) }))}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-white outline-none" />
                </label>
              ))}
            </div>
          )}
          <button type="button" disabled={loadingFinancialLimits || savingFinancialLimits} onClick={() => void saveFinancialLimits()}
            className="mt-4 w-full rounded-xl bg-cyan-600 px-5 py-3 font-black text-slate-950 disabled:opacity-50">
            {savingFinancialLimits ? "جاري حفظ الحدود..." : "حفظ حدود الإيداع"}
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
                <div className="min-h-[6rem]" aria-hidden="true" />
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