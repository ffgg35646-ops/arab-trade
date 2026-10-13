"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PackagePlan = { _id: string; name: string; price: number; minimumWithdrawal?: number; enabled?: boolean };

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
  const [newCurrency, setNewCurrency] = useState("");
  const [newNetwork, setNewNetwork] = useState("");
  const [newMinimum, setNewMinimum] = useState("0");
  const [newAddress, setNewAddress] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [packagePlans, setPackagePlans] = useState<PackagePlan[]>([]);
  const [packageWithdrawalMinimums, setPackageWithdrawalMinimums] = useState<Record<string, number>>({});
  const [savingPackageMinimums, setSavingPackageMinimums] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(true);

  const load = useCallback(async () => {

    try {
      const [res, settingsRes, packagesRes] = await Promise.all([
        fetch("/api/admin/payment", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/admin/settings", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/admin/packages", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const settingsJson = await settingsRes.json().catch(() => ({}));
      const packagesJson = await packagesRes.json().catch(() => ({}));
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

      setPayments(rows);

      if (!packagesRes.ok || !packagesJson.success || !Array.isArray(packagesJson.packages)) {
        throw new Error(packagesJson.message || "تعذر تحميل الباقات لإعداد السحب منها");
      }
      const plans: PackagePlan[] = packagesJson.packages.map((item: PackagePlan) => ({
        _id: String(item._id),
        name: String(item.name || "باقة"),
        price: Number(item.price || 0),
        minimumWithdrawal: Number(item.minimumWithdrawal ?? settingsJson.settings?.withdrawals?.minAmount ?? 0),
        enabled: item.enabled !== false,
      }));
      const rawConfigured = settingsJson.settings?.withdrawals?.withdrawalMinByPackage;
      const configured: Record<string, number> = rawConfigured && typeof rawConfigured === "object"
        ? (rawConfigured instanceof Map ? Object.fromEntries(rawConfigured.entries()) : rawConfigured as Record<string, number>)
        : {};
      const minima: Record<string, number> = {};
      for (const plan of plans) {
        minima[plan._id] = Number(configured[plan._id] ?? plan.minimumWithdrawal ?? settingsJson.settings?.withdrawals?.minAmount ?? 0);
      }
      setPackagePlans(plans);
      setPackageWithdrawalMinimums(minima);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "تعذر تحميل وسائل الدفع"
      );
    } finally {
      setLoading(false);
      setLoadingPackages(false);
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
    setNewCurrency("");
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
      setNewCurrency("");
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
        maxDeposit: Number(payment.maxDeposit),
        minWithdrawal: Number(payment.minWithdrawal),
        maxWithdrawal: Number(payment.maxWithdrawal),
        withdrawalFee: Number(payment.withdrawalFee),
        warning: payment.warning.trim(),
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


  async function savePackageWithdrawalMinimums() {
    const entries = Object.entries(packageWithdrawalMinimums);
    if (!entries.every(([id, value]) => Boolean(id) && Number.isFinite(Number(value)) && Number(value) >= 0)) {
      setError("تأكد من أن الحد الأدنى للسحب لكل باقة رقم صحيح لا يقل عن صفر");
      return;
    }
    setSavingPackageMinimums(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawals: { withdrawalMinByPackage: packageWithdrawalMinimums } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر حفظ حدود السحب لكل باقة");
      const saved = json.settings?.withdrawals?.withdrawalMinByPackage;
      if (saved && typeof saved === "object") {
        setPackageWithdrawalMinimums(saved instanceof Map ? Object.fromEntries(saved.entries()) : saved);
      }
      setMessage("تم حفظ الحد الأدنى للسحب لكل باقة. سيظهر الحد للمستخدم عند السحب من أرباح الباقة.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ حدود السحب لكل باقة");
    } finally {
      setSavingPackageMinimums(false);
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

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => addPayment("deposit")} className="rounded-xl bg-blue-600 px-5 py-3 font-black transition hover:bg-blue-500">
              + إضافة وسيلة إيداع
            </button>
            <button type="button" onClick={() => addPayment("withdrawal")} className="rounded-xl bg-violet-600 px-5 py-3 font-black transition hover:bg-violet-500">
              + إضافة وسيلة سحب عام
            </button>
            <a href="#package-withdrawal-settings" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 font-black text-emerald-200 transition hover:bg-emerald-400/15">
              + إضافة وسيلة سحب من الباقات
            </a>
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
            <p className="mt-2 text-sm leading-6 text-slate-400">هذا المفتاح يوقف أو يفعّل إرسال طلبات الإيداع الجديدة على المنصة. حدود الإيداع العامة يمكن تعديلها من إعدادات المنصة، كما يمكن ضبط حدود مختلفة لكل وسيلة أدناه.</p>
            <Link href="/admin/settings" className="mt-2 inline-flex text-sm font-bold text-cyan-300 hover:text-cyan-200">تعديل الحدود العامة للإيداع ←</Link>
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
                <input value={newCurrency} onChange={(e) => setNewCurrency(e.target.value.toUpperCase())} placeholder="مثال: USDT" className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 uppercase outline-none focus:border-blue-500" />
              </label>
              <label className="block text-sm font-bold">شبكة العملة
                <input value={newNetwork} onChange={(e) => setNewNetwork(e.target.value)} placeholder="مثال: TRC20" className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500" />
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
            <p className="mt-4 text-xs leading-5 text-slate-500">يتم حفظ وسيلة الإيداع والسحب في قاعدة البيانات، مع الحفاظ على إعدادات الوسيلة الأخرى عند استخدام العملة والشبكة نفسيهما.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={savingNew} onClick={() => void saveNewPayment()} className="rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50">{savingNew ? "جاري الحفظ..." : addingKind === "deposit" ? "حفظ وسيلة الإيداع" : "حفظ وسيلة السحب"}</button>
              <button type="button" disabled={savingNew} onClick={() => setAddingKind("")} className="rounded-xl border border-slate-700 px-5 py-3 font-bold disabled:opacity-50">إلغاء</button>
            </div>
          </section>
        ) : null}

        <section id="package-withdrawal-settings" className="scroll-mt-6 rounded-2xl border border-emerald-400/20 bg-[#08111e] p-5 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-black">سحب أرباح الباقات — الحد الأدنى لكل باقة</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">كل الباقات الموجودة في صفحة «إدارة الباقات» تظهر هنا تلقائيًا، بما فيها الباقات الأربع الحالية وأي باقة جديدة مثل «باقة 400». حدّث الحد الأدنى ثم احفظه ليُطبّق على سحب أرباح تلك الباقة عند المستخدم. وسيلة الشبكة/عنوان الاستلام تظل من وسائل السحب العامة.</p>
            </div>
            <button type="button" onClick={() => { setLoading(true); setLoadingPackages(true); void load(); }} disabled={loading} className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold disabled:opacity-50">تحديث الباقات</button>
          </div>

          {loadingPackages ? (
            <p className="py-6 text-center text-sm text-slate-500">جاري تحميل الباقات...</p>
          ) : packagePlans.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-700 p-6 text-sm leading-6 text-slate-400">لم تصل أي باقات من قاعدة البيانات. تأكد من نجاح تحميل صفحة إدارة الباقات، ثم اضغط «تحديث الباقات».</p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {packagePlans.map((plan) => (
                <label key={plan._id} className="block rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-black">{plan.name}</span>
                    <span className={plan.enabled ? "rounded-full bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-200" : "rounded-full bg-slate-700 px-2 py-1 text-[11px] text-slate-300"}>{plan.enabled ? "مفعلة" : "متوقفة"}</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">قيمة الباقة: {Number(plan.price || 0).toLocaleString("en-US")} USDT</span>
                  <span className="mt-4 block text-sm font-bold">الحد الأدنى للسحب من هذه الباقة (USDT)</span>
                  <input type="number" min="0" step="any" value={packageWithdrawalMinimums[plan._id] ?? Number(plan.minimumWithdrawal || 0)} onChange={(event) => setPackageWithdrawalMinimums((current) => ({ ...current, [plan._id]: Number(event.target.value) }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-white outline-none focus:border-emerald-400"/>
                </label>
              ))}
            </div>
          )}
          <button type="button" disabled={loadingPackages || savingPackageMinimums || packagePlans.length === 0} onClick={() => void savePackageWithdrawalMinimums()} className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50">
            {savingPackageMinimums ? "جاري حفظ حدود سحب الباقات..." : "حفظ الحد الأدنى لكل باقة"}
          </button>
        </section>

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

                  <details className="group">
                    <summary className="cursor-pointer rounded-xl border border-slate-700 bg-[#0b1422] p-4 font-bold">تعديل تفاصيل وسيلة الدفع الحالية</summary>
                    <div className="space-y-4 pt-4">
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
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        يظهر هذا العنوان في صفحة الإيداع للمستخدمين لهذه العملة والشبكة. عنوان استلام المستخدم عند السحب يكتبه المستخدم في صفحة السحب ولا يُستبدل بعنوان الإيداع.
                      </p>
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
                        عنوان الإيداع / بيانات التحويل التي ستظهر للمستخدم
                      </label>

                      <textarea
                        value={payment.address}
                        onChange={(e) =>
                          updatePayment(index, {
                            address: e.target.value,
                          })
                        }
                        rows={3}
                        placeholder="عنوان محفظة الإيداع أو رقم الحساب أو بيانات التحويل"
                        className="w-full resize-none rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"
                      />
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        يظهر هذا العنوان في صفحة الإيداع للمستخدمين لهذه العملة والشبكة. عنوان استلام المستخدم عند السحب يكتبه المستخدم في صفحة السحب ولا يُستبدل بعنوان الإيداع.
                      </p>
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

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="block text-sm font-bold">الحد الأقصى للإيداع (0 = غير محدد)
                        <input type="number" min="0" step="any" value={payment.maxDeposit} onChange={(e) => updatePayment(index, { maxDeposit: Number(e.target.value) || 0 })} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"/>
                      </label>
                      <label className="block text-sm font-bold">الحد الأقصى للسحب (0 = غير محدد)
                        <input type="number" min="0" step="any" value={payment.maxWithdrawal} onChange={(e) => updatePayment(index, { maxWithdrawal: Number(e.target.value) || 0 })} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"/>
                      </label>
                      <label className="block text-sm font-bold">رسوم السحب
                        <input type="number" min="0" step="any" value={payment.withdrawalFee} onChange={(e) => updatePayment(index, { withdrawalFee: Number(e.target.value) || 0 })} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"/>
                      </label>
                      <label className="block text-sm font-bold md:col-span-2 xl:col-span-3">تنبيه يظهر في صفحة السحب
                        <textarea value={payment.warning} onChange={(e) => updatePayment(index, { warning: e.target.value })} rows={2} maxLength={1000} placeholder="تنبيه اختياري عن وسيلة الدفع أو الشبكة" className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none focus:border-blue-500"/>
                      </label>
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