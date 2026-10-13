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
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalFee: number;
  warning: string;
  enabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
};

export default function PaymentsAdminPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [deleting, setDeleting] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [globalDepositsEnabled, setGlobalDepositsEnabled] = useState(true);
  const [savingGlobalDeposits, setSavingGlobalDeposits] = useState(false);
  const [addingKind, setAddingKind] = useState<"deposit" | "withdrawal" | "">("");
  const [newCurrency, setNewCurrency] = useState("USDT");
  const [newNetwork, setNewNetwork] = useState("");
  const [newMinimum, setNewMinimum] = useState("0");
  const [newAddress, setNewAddress] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  const load = useCallback(async () => {

    try {
      const [res, settingsRes] = await Promise.all([
        fetch("/api/admin/payment", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/admin/settings", {
          credentials: "include",
          cache: "no-store",
        }),
]);

      const settingsJson = await settingsRes.json().catch(() => ({}));
      if (settingsRes.ok && settingsJson.success) {
        setGlobalDepositsEnabled(settingsJson.settings?.deposits?.enabled !== false);
      }

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
            maxDeposit: Number(item.maxDeposit || 0),
            minWithdrawal: Number(item.minWithdrawal || 0),
            maxWithdrawal: Number(item.maxWithdrawal || 0),
            withdrawalFee: Number(item.withdrawalFee || 0),
            warning: String(item.warning || ""),
            enabled: Boolean(item.enabled),
            depositEnabled: item.depositEnabled !== false,
            withdrawalEnabled: item.withdrawalEnabled !== false,
          }))
        : [];

      setPayments(rows.filter((item) => item.depositEnabled));

      setError("");
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
    void Promise.resolve().then(() => { void load(); });
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

  function addPayment(kind: "deposit" | "withdrawal") {
    setAddingKind(kind);
    setNewCurrency("USDT");
    setNewNetwork("");
    setNewMinimum("0");
    setNewAddress("");
    setMessage("");
    setError("");
  }

  async function saveNewPayment() {
    const asset = newCurrency.trim().toUpperCase();
    const network = newNetwork.trim();
    const minimum = Number(newMinimum);
    if (!addingKind) return;
    if (!asset || !network) {
      setError("اسم العملة والشبكة مطلوبان");
      return;
    }
    if (!Number.isFinite(minimum) || minimum < 0) {
      setError("الحد الأدنى غير صالح");
      return;
    }
    if (addingKind === "deposit" && !newAddress.trim()) {
      setError("عنوان الإيداع مطلوب");
      return;
    }

    setSavingNew(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/payment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: addingKind,
          name: asset,
          asset,
          network,
          address: addingKind === "deposit" ? newAddress.trim() : "",
          minDeposit: addingKind === "deposit" ? minimum : 0,
          minWithdrawal: addingKind === "withdrawal" ? minimum : 0,
          enabled: true,
          depositEnabled: addingKind === "deposit",
          withdrawalEnabled: addingKind === "withdrawal",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.message || "تعذر إضافة الوسيلة");
      }
      setMessage(addingKind === "deposit" ? "تمت إضافة وسيلة الإيداع بنجاح." : "تمت إضافة وسيلة السحب بنجاح.");
      setAddingKind("");
      setNewCurrency("USDT");
      setNewNetwork("");
      setNewMinimum("0");
      setNewAddress("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إضافة الوسيلة");
    } finally {
      setSavingNew(false);
    }
  }

  async function save(index: number) {
    const payment = payments[index];

    if (!payment) return;

    if (!payment.asset.trim()) {
      setError("رمز العملة مطلوب");
      return;
    }

    if (!payment.network.trim()) {
      setError("الشبكة مطلوبة");
      return;
    }

    if (!payment.address.trim()) {
      setError("عنوان الإيداع مطلوب");
      return;
    }

    if (
      !Number.isFinite(Number(payment.minDeposit)) ||
      Number(payment.minDeposit) < 0
    ) {
      setError("الحد الأدنى للإيداع غير صالح");
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
        maxDeposit: Number(payment.maxDeposit),
        enabled: Boolean(payment.enabled),
        depositEnabled: Boolean(payment.depositEnabled),
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


  async function toggleGlobalDeposits() {
    if (savingGlobalDeposits) return;
    const nextValue = !globalDepositsEnabled;
    setSavingGlobalDeposits(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposits: { enabled: nextValue } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.message || "تعذر تغيير حالة الإيداع");
      }
      setGlobalDepositsEnabled(json.settings?.deposits?.enabled !== false);
      setMessage(nextValue ? "تم تفعيل الإيداع للمستخدمين." : "تم إيقاف الإيداع مؤقتًا؛ لن يمكن إرسال طلبات جديدة.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تغيير حالة الإيداع");
    } finally {
      setSavingGlobalDeposits(false);
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
    <AdminPageFrame title="وسائل الإيداع">
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black">
              وسائل الإيداع
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              وسائل الإيداع المسجلة في قاعدة البيانات.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => addPayment("deposit")} className="rounded-xl bg-blue-600 px-5 py-3 font-black transition hover:bg-blue-500">
              + إضافة وسيلة إيداع
            </button>
</div>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#08111e] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-black">حالة الإيداع العامة</h2>
              <span className={globalDepositsEnabled ? "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200" : "rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200"}>
                {globalDepositsEnabled ? "مفعل" : "متوقف"}
              </span>
            </div>
          </div>
          <button type="button" onClick={() => void toggleGlobalDeposits()} disabled={savingGlobalDeposits} className={globalDepositsEnabled ? "rounded-xl border border-amber-400/25 bg-amber-400/10 px-5 py-3 font-black text-amber-100 disabled:opacity-50" : "rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50"}>
            {savingGlobalDeposits ? "جاري الحفظ..." : globalDepositsEnabled ? "إيقاف الإيداع مؤقتًا" : "تفعيل الإيداع"}
          </button>
        </section>

        {addingKind ? (
          <section className="rounded-2xl border border-slate-700 bg-[#08111e] p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">{addingKind === "deposit" ? "إضافة وسيلة إيداع" : "إضافة وسيلة سحب"}</h2>
              <button type="button" onClick={() => setAddingKind("")} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300">إلغاء</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-bold">اسم العملة / الرمز
                <select value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500">
                  <option value="USDT">USDT — Tether</option>
                </select>
              </label>
              <label className="block text-sm font-bold">شبكة العملة
                <select value={newNetwork} onChange={(e) => setNewNetwork(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500">
                  <option value="">اختر الشبكة</option>
                  <option value="TRC20">TRC (TRC20)</option>
                  <option value="BEP20">BNB Smart Chain (BEP20)</option>
                </select>
              </label>
              <label className="block text-sm font-bold">{addingKind === "deposit" ? "الحد الأدنى للإيداع" : "الحد الأدنى للسحب"}
                <input type="number" min="0" step="any" value={newMinimum} onChange={(e) => setNewMinimum(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500" />
              </label>
              {addingKind === "deposit" ? (
                <label className="block text-sm font-bold md:col-span-2">عنوان الإيداع
                  <textarea value={newAddress} onChange={(e) => setNewAddress(e.target.value)} rows={3} placeholder="عنوان المحفظة أو بيانات التحويل التي ستظهر للمستخدم" className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500" />
                </label>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={savingNew} onClick={() => void saveNewPayment()} className="rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50">{savingNew ? "جاري الحفظ..." : addingKind === "deposit" ? "حفظ وسيلة الإيداع" : "حفظ وسيلة السحب"}</button>
              <button type="button" disabled={savingNew} onClick={() => setAddingKind("")} className="rounded-xl border border-slate-700 px-5 py-3 font-bold disabled:opacity-50">إلغاء</button>
            </div>
          </section>
        ) : null}



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
            جاري تحميل وسائل الإيداع...
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-[#08111e] p-12 text-center">
            <div className="text-lg font-black text-slate-300">
              لا توجد وسائل إيداع
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
                  <div className="mb-6">
                    <h2 className="text-xl font-black">
                      {payment.asset || "USDT"} {payment.network ? `• ${payment.network}` : ""}
                    </h2>
                  </div>

                  <details className="group">
                    <summary className="cursor-pointer rounded-xl border border-slate-700 bg-[#0b1422] p-4 font-bold">تعديل تفاصيل وسيلة الإيداع</summary>
                    <div className="space-y-4 pt-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-bold">العملة / الرمز</label>
                          <select value={payment.asset} onChange={(e) => updatePayment(index, { asset: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500">
                            <option value="USDT">USDT — Tether</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-bold">الشبكة / النوع</label>
                          <select value={payment.network} onChange={(e) => updatePayment(index, { network: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500">
                            <option value="TRC20">TRC20</option>
                            <option value="BEP20">BEP20</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-bold">عنوان الإيداع / بيانات التحويل</label>
                        <input value={payment.address} onChange={(e) => updatePayment(index, { address: e.target.value })} placeholder="عنوان محفظة الإيداع أو بيانات التحويل" className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500" />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-bold">الحد الأدنى للإيداع</label>
                        <input value={payment.minDeposit} onChange={(e) => updatePayment(index, { minDeposit: Number(e.target.value) || 0 })} type="number" min="0" step="any" className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500" />
                      </div>


                    </div>
                  </details>

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