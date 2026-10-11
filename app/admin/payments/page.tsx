"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import { useCallback, useEffect, useState } from "react";

type Payment = {
  _id?: string;
  name: string;
  asset: string;
  network: string;
  address: string;
  minDeposit: number;
  minWithdrawal: number;
  enabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
};

const EMPTY_PAYMENT: Payment = {
  name: "",
  asset: "",
  network: "",
  address: "",
  minDeposit: 0,
  minWithdrawal: 0,
  enabled: false,
  depositEnabled: true,
  withdrawalEnabled: true,
};

export default function PaymentsAdminPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [deleting, setDeleting] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {

    try {
      const res = await fetch("/api/admin/payment", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.message || json?.error || "تعذر تحميل وسائل الدفع"
        );
      }

      const rows: Payment[] = Array.isArray(json.methods)
        ? json.methods.map((item: Payment) => ({
            _id: item._id ? String(item._id) : undefined,
            name: String(item.name || ""),
            asset: String(item.asset || ""),
            network: String(item.network || ""),
            address: String(item.address || ""),
            minDeposit: Number(item.minDeposit || 0),
            minWithdrawal: Number(item.minWithdrawal || 0),
            enabled: Boolean(item.enabled),
            depositEnabled: item.depositEnabled !== false,
            withdrawalEnabled: item.withdrawalEnabled !== false,
          }))
        : [];

      setPayments(rows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "تعذر تحميل وسائل الدفع"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updatePayment(
    index: number,
    patch: Partial<Payment>
  ) {
    setPayments((current) =>
      current.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      )
    );
  }

  function addPayment() {
    setPayments((current) => [
      {
        ...EMPTY_PAYMENT,
      },
      ...current,
    ]);

    setMessage("");
    setError("");
  }

  async function save(index: number) {
    const payment = payments[index];

    if (!payment) return;

    if (!payment.name.trim()) {
      setError("اسم وسيلة الدفع مطلوب");
      return;
    }

    if (!payment.asset.trim()) {
      setError("رمز العملة مطلوب");
      return;
    }

    if (!payment.network.trim()) {
      setError("الشبكة مطلوبة");
      return;
    }

    if (!payment.address.trim()) {
      setError("عنوان أو بيانات التحويل مطلوبة");
      return;
    }

    if (
      !Number.isFinite(Number(payment.minDeposit)) ||
      Number(payment.minDeposit) < 0
    ) {
      setError("الحد الأدنى للإيداع غير صالح");
      return;
    }

    if (
      !Number.isFinite(Number(payment.minWithdrawal)) ||
      Number(payment.minWithdrawal) < 0
    ) {
      setError("الحد الأدنى للسحب غير صالح");
      return;
    }

    const savingKey =
      payment._id || `${payment.asset}-${payment.network}`;

    setSaving(savingKey);
    setMessage("");
    setError("");

    try {
      const method = payment._id ? "PATCH" : "POST";

      const body = {
        ...(payment._id ? { id: payment._id } : {}),
        name: payment.name.trim(),
        asset: payment.asset.trim().toUpperCase(),
        network: payment.network.trim(),
        address: payment.address.trim(),
        minDeposit: Number(payment.minDeposit),
        minWithdrawal: Number(payment.minWithdrawal),
        enabled: Boolean(payment.enabled),
        depositEnabled: Boolean(payment.depositEnabled),
        withdrawalEnabled: Boolean(payment.withdrawalEnabled),
      };

      const res = await fetch("/api/admin/payment", {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.message ||
            json?.error ||
            "تعذر حفظ وسيلة الدفع"
        );
      }

      setMessage(
        payment._id
          ? `تم تحديث ${payment.name}`
          : `تمت إضافة ${payment.name}`
      );

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "تعذر حفظ وسيلة الدفع"
      );
    } finally {
      setSaving("");
    }
  }

  async function removePayment(payment: Payment) {
    if (!payment._id) {
      setPayments((current) =>
        current.filter((item) => item !== payment)
      );
      return;
    }

    const confirmed = window.confirm(
      `هل أنت متأكد من حذف وسيلة الدفع "${payment.name}"؟`
    );

    if (!confirmed) return;

    setDeleting(payment._id);
    setMessage("");
    setError("");

    try {
      const res = await fetch(
        `/api/admin/payment?id=${encodeURIComponent(payment._id)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.message ||
            json?.error ||
            "تعذر حذف وسيلة الدفع"
        );
      }

      setMessage(`تم حذف ${payment.name}`);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "تعذر حذف وسيلة الدفع"
      );
    } finally {
      setDeleting("");
    }
  }

  return (
    <AdminPageFrame title="وسائل الدفع">
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black">
              وسائل الدفع والإيداع والسحب
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              جميع وسائل الدفع هنا تأتي من قاعدة البيانات.
              يمكنك إضافة أو تعديل أو إيقاف أي وسيلة.
            </p>
          </div>

          <button
            type="button"
            onClick={addPayment}
            className="rounded-xl bg-blue-600 px-5 py-3 font-black transition hover:bg-blue-500"
          >
            + إضافة وسيلة دفع
          </button>
        </div>

        {message ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-12 text-center text-slate-500">
            جاري تحميل وسائل الدفع...
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-[#08111e] p-12 text-center">
            <div className="text-lg font-black text-slate-300">
              لا توجد وسائل دفع
            </div>

            <p className="mt-2 text-sm text-slate-500">
              أضف أول وسيلة دفع من الزر الموجود بالأعلى.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {payments.map((payment, index) => {
              const savingKey =
                payment._id ||
                `${payment.asset}-${payment.network}`;

              const isSaving = saving === savingKey;

              return (
                <div
                  key={
                    payment._id ||
                    `new-${index}-${payment.asset}-${payment.network}`
                  }
                  className="rounded-2xl border border-slate-800 bg-[#08111e] p-6"
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black">
                        {payment.name || "وسيلة دفع جديدة"}
                      </h2>

                      <div className="mt-1 text-xs text-slate-500">
                        {payment.asset || "بدون عملة"}{" "}
                        {payment.network
                          ? `• ${payment.network}`
                          : ""}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updatePayment(index, {
                          enabled: !payment.enabled,
                        })
                      }
                      className={`rounded-full px-4 py-2 text-xs font-black ${
                        payment.enabled
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {payment.enabled
                        ? "مفعلة"
                        : "متوقفة"}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-bold">
                        اسم وسيلة الدفع
                      </label>

                      <input
                        value={payment.name}
                        onChange={(e) =>
                          updatePayment(index, {
                            name: e.target.value,
                          })
                        }
                        placeholder="مثال: شام سوري"
                        className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-bold">
                          العملة / الرمز
                        </label>

                        <input
                          value={payment.asset}
                          onChange={(e) =>
                            updatePayment(index, {
                              asset: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder="مثال: USDT"
                          className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 uppercase outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-bold">
                          الشبكة / النوع
                        </label>

                        <input
                          value={payment.network}
                          onChange={(e) =>
                            updatePayment(index, {
                              network: e.target.value,
                            })
                          }
                          placeholder="مثال: TRC20 أو SHAM"
                          className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold">
                        عنوان / بيانات التحويل
                      </label>

                      <textarea
                        value={payment.address}
                        onChange={(e) =>
                          updatePayment(index, {
                            address: e.target.value,
                          })
                        }
                        rows={3}
                        placeholder="أدخل عنوان المحفظة أو رقم/بيانات التحويل"
                        className="w-full resize-none rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-bold">
                          الحد الأدنى للإيداع
                        </label>

                        <input
                          value={payment.minDeposit}
                          onChange={(e) =>
                            updatePayment(index, {
                              minDeposit:
                                Number(e.target.value) || 0,
                            })
                          }
                          type="number"
                          min="0"
                          step="any"
                          className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-bold">
                          الحد الأدنى للسحب
                        </label>

                        <input
                          value={payment.minWithdrawal}
                          onChange={(e) =>
                            updatePayment(index, {
                              minWithdrawal:
                                Number(e.target.value) || 0,
                            })
                          }
                          type="number"
                          min="0"
                          step="any"
                          className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                        <span>
                          <span className="block font-bold">السماح بالإيداع</span>
                          <span className="mt-1 block text-xs text-slate-500">عرض الوسيلة وقبول طلبات الإيداع بها</span>
                        </span>
                        <input type="checkbox" checked={payment.depositEnabled} onChange={(e) => updatePayment(index, { depositEnabled: e.target.checked })} className="h-5 w-5 accent-cyan-400" />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.04] p-4">
                        <span>
                          <span className="block font-bold">السماح بالسحب</span>
                          <span className="mt-1 block text-xs text-slate-500">عرض الوسيلة وقبول طلبات السحب بها</span>
                        </span>
                        <input type="checkbox" checked={payment.withdrawalEnabled} onChange={(e) => updatePayment(index, { withdrawalEnabled: e.target.checked })} className="h-5 w-5 accent-violet-400" />
                      </label>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-black/10 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-bold">
                            حالة الوسيلة
                          </div>

                          <div className="mt-1 text-xs text-slate-500">
                            عند إيقافها لن تكون متاحة كوسيلة دفع
                            للمستخدم.
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updatePayment(index, {
                              enabled: !payment.enabled,
                            })
                          }
                          className={`rounded-xl px-4 py-2 text-sm font-black ${
                            payment.enabled
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-red-500/15 text-red-300"
                          }`}
                        >
                          {payment.enabled
                            ? "مفعلة"
                            : "متوقفة"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void save(index)}
                      className="flex-1 rounded-xl bg-blue-600 px-5 py-3 font-black transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving
                        ? "جاري الحفظ..."
                        : payment._id
                        ? "حفظ التعديلات"
                        : "إضافة وسيلة الدفع"}
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(deleting)}
                      onClick={() =>
                        void removePayment(payment)
                      }
                      className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3 font-black text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {deleting === payment._id
                        ? "جاري الحذف..."
                        : "حذف"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminPageFrame>
  );
}