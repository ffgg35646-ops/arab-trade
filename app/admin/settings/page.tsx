"use client";

import { useEffect, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";
import AdminDataPage from "@/components/AdminDataPage";

type Support = {
  email: string;
  facebook: string;
  telegram: string;
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

  useEffect(() => {
    void loadSupport();
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