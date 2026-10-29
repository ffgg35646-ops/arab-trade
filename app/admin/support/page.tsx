"use client";

import { useEffect, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";

type Support = {
  email: string;
  facebook: string;
  telegram: string;
};

export default function AdminSupportPage() {
  const [support, setSupport] = useState<Support>({
    email: "",
    facebook: "",
    telegram: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
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

      setSupport(json.support);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "حدث خطأ"
      );
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);

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

      setSupport(json.support);
      alert("تم حفظ بيانات الدعم");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "حدث خطأ"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageFrame title="الدعم">
      <div dir="rtl" className="max-w-3xl">
        <section className="rounded-2xl border border-slate-800 bg-[#08111e] p-6">
          <h2 className="text-xl font-black">
            بيانات الدعم
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            أي تعديل هنا يظهر للمستخدم بعد الحفظ.
          </p>

          {loading ? (
            <div className="mt-6 min-h-[18rem]" aria-hidden="true" />
          ) : (
            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold">
                  البريد الإلكتروني
                </label>

                <input
                  type="email"
                  value={support.email}
                  onChange={(e) =>
                    setSupport((v) => ({
                      ...v,
                      email: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                  placeholder="support@arabtrade.com"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  فيسبوك
                </label>

                <input
                  value={support.facebook}
                  onChange={(e) =>
                    setSupport((v) => ({
                      ...v,
                      facebook: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                  placeholder="https://facebook.com/ArabTrade"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  تيليجرام
                </label>

                <input
                  value={support.telegram}
                  onChange={(e) =>
                    setSupport((v) => ({
                      ...v,
                      telegram: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                  placeholder="https://t.me/ArabTrade"
                />
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="w-full rounded-xl bg-blue-600 px-5 py-3 font-black disabled:opacity-50"
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