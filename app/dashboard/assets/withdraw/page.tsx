"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { ArrowDownToLine, Clock3, RefreshCw, ShieldCheck, Wallet } from "lucide-react";

type Method = {
  _id: string;
  name: string;
  asset: string;
  network: string;
  minWithdrawal: number;
  maxWithdrawal?: number;
  withdrawalFee?: number;
  enabled: boolean;
  withdrawalEnabled?: boolean;
  warning?: string;
};
type Balance = { asset: string; available: number; locked: number };
type SavedAddress = { _id: string; asset: string; network: string; address: string; source: "wallet" | "package" };
type PackageAccount = {
  _id: string;
  packageName: string;
  asset: string;
  status: "active" | "cancelled";
  availableEarnings: number;
  lockedEarnings: number;
  investedAmount: number;
  durationDays?: number;
  totalRealizedEarnings: number;
  totalWithdrawn: number;
  firstWithdrawalStatus?: "available" | "pending" | "completed";
  activeReferralCount?: number;
  activeReferralDepositTotal?: number;
  firstPackageWithdrawalPercent?: number;
  referralPackageWithdrawalPercent?: number;
  referralWithdrawalCap?: number;
  referralAlreadyWithdrawn?: number;
  referralRemaining?: number;
  withdrawalLimit?: number;
  minimumWithdrawal?: number;
};
type Withdrawal = {
  _id: string;
  amount: number;
  asset: string;
  network: string;
  address: string;
  status: string;
  source?: "wallet" | "package";
  userPackageId?: string | { _id?: string; packageName?: string } | null;
  fee?: number;
  receiveAmount?: number;
  adminNote?: string;
  createdAt: string;
};
type PaymentLimits = { minDeposit: number; maxDeposit: number; minWithdrawal: number; minGeneralWithdrawal: number; maxWithdrawal: number; dailyWithdrawalLimit: number };
type WithdrawalForm = { methodId: string; amount: string; address: string };

const emptyForm: WithdrawalForm = { methodId: "", amount: "", address: "" };
const money = (value: number) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const statusLabel = (status: string) => status === "completed" ? "مكتمل" : status === "approved" ? "تمت الموافقة" : status === "processing" ? "قيد التنفيذ" : status === "rejected" ? "مرفوض" : status === "failed" ? "فشل التنفيذ" : "قيد المراجعة";
const statusClass = (status: string) => status === "completed" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : status === "rejected" || status === "failed" ? "border-red-400/20 bg-red-400/10 text-red-200" : status === "approved" || status === "processing" ? "border-blue-400/20 bg-blue-400/10 text-blue-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200";

function packageMaximum(item: PackageAccount) {
  const isFirst = item.status === "active" &&
    item.firstWithdrawalStatus !== "pending" &&
    item.firstWithdrawalStatus !== "completed" &&
    Number(item.totalWithdrawn || 0) <= 0;
  const configuredLimit = item.withdrawalLimit ?? (
    isFirst
      ? Number(item.investedAmount || 0) * Number(item.firstPackageWithdrawalPercent ?? 100) / 100
      : Number(item.referralRemaining || 0)
  );
  return Math.max(0, Math.min(Number(item.availableEarnings || 0), Number(configuredLimit || 0)));
}

export default function WithdrawPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [limits, setLimits] = useState<PaymentLimits>({ minDeposit: 0, maxDeposit: 0, minWithdrawal: 0, minGeneralWithdrawal: 0, maxWithdrawal: 0, dailyWithdrawalLimit: 0 });
  const [depositBalances, setDepositBalances] = useState<Balance[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [packageAccounts, setPackageAccounts] = useState<PackageAccount[]>([]);
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [generalForm, setGeneralForm] = useState<WithdrawalForm>(emptyForm);
  const [packageForms, setPackageForms] = useState<Record<string, WithdrawalForm>>({});
  const [loading, setLoading] = useState(true);
  const [submittingKey, setSubmittingKey] = useState("");
  const [savingAddressKey, setSavingAddressKey] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const responses = await Promise.all([
        fetch("/api/payment-options", { credentials: "include", cache: "no-store" }),
        fetch("/api/wallet", { credentials: "include", cache: "no-store" }),
        fetch("/api/withdrawals", { credentials: "include", cache: "no-store" }),
        fetch("/api/withdrawal-addresses", { credentials: "include", cache: "no-store" }),
        fetch("/api/packages", { credentials: "include", cache: "no-store" }),
      ]);
      const [methodsData, walletData, historyData, addressesData, packageData] = await Promise.all(
        responses.map(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.success) throw new Error(data.message || "تعذر تحميل بيانات السحب");
          return data;
        })
      );

      if (methodsData.limits) {
        setLimits({
          minDeposit: Number(methodsData.limits.minDeposit || 0),
          maxDeposit: Number(methodsData.limits.maxDeposit || 0),
          minWithdrawal: Number(methodsData.limits.minWithdrawal || 0),
          minGeneralWithdrawal: Number(methodsData.limits.minGeneralWithdrawal || 0),
          maxWithdrawal: Number(methodsData.limits.maxWithdrawal || 0),
          dailyWithdrawalLimit: Number(methodsData.limits.dailyWithdrawalLimit || 0),
        });
      }
      const methodRows: Method[] = Array.isArray(methodsData.methods)
        ? methodsData.methods.filter((item: Method) => item.enabled !== false && item.withdrawalEnabled !== false)
        : [];
      const packageRows: PackageAccount[] = Array.isArray(packageData.userPackages)
        ? packageData.userPackages.filter((item: PackageAccount) =>
            ["active", "cancelled"].includes(item.status) && String(item.asset || "").toUpperCase() === "USDT"
          )
        : [];
      const loadedAddresses: SavedAddress[] = Array.isArray(addressesData.addresses) ? addressesData.addresses : [];
      const generalMethods = methodRows;
      const packageMethods = methodRows.filter((item) => item.asset === "USDT");

      setMethods(methodRows);
      setDepositBalances(Array.isArray(walletData.depositBalances) ? walletData.depositBalances : []);
      setBalances(Array.isArray(walletData.generalWithdrawalBalances) ? walletData.generalWithdrawalBalances : (walletData.spot?.balances || walletData.wallet?.balances || []));
      setHistory(Array.isArray(historyData.withdrawals) ? historyData.withdrawals : []);
      setSavedAddresses(loadedAddresses);
      setPackageAccounts(packageRows);

      setGeneralForm((current) => {
        const methodId = generalMethods.some((item) => item._id === current.methodId) ? current.methodId : (generalMethods[0]?._id || "");
        const selected = generalMethods.find((item) => item._id === methodId);
        const stored = selected && loadedAddresses.find((item) => item.asset === selected.asset && item.network === selected.network && item.source === "wallet");
        return { ...current, methodId, address: current.address || stored?.address || "" };
      });
      setPackageForms((current) => {
        const next: Record<string, WithdrawalForm> = { ...current };
        for (const account of packageRows) {
          const old = next[account._id] || emptyForm;
          const methodId = packageMethods.some((item) => item._id === old.methodId) ? old.methodId : (packageMethods[0]?._id || "");
          const selected = packageMethods.find((item) => item._id === methodId);
          const stored = selected && loadedAddresses.find((item) => item.asset === selected.asset && item.network === selected.network && item.source === "package");
          next[account._id] = { ...old, methodId, address: old.address || stored?.address || "" };
        }
        return next;
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء تحميل بيانات السحب");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => { void load(); });
  }, [load]);

  const totalGeneralAvailable = useMemo(
    () => balances.reduce((sum, item) => sum + (String(item.asset).toUpperCase() === "USDT" ? Number(item.available || 0) : 0), 0),
    [balances]
  );
  const totalPackageAvailable = useMemo(
    () => packageAccounts.reduce((sum, item) => sum + Number(item.availableEarnings || 0), 0),
    [packageAccounts]
  );
  const totalPackageLocked = useMemo(
    () => packageAccounts.reduce((sum, item) => sum + Number(item.lockedEarnings || 0), 0),
    [packageAccounts]
  );
  const totalDepositAvailable = useMemo(
    () => depositBalances.reduce((sum, item) => sum + (String(item.asset).toUpperCase() === "USDT" ? Number(item.available || 0) : 0), 0),
    [depositBalances]
  );
  const openWithdrawals = history.filter((item) => ["pending", "approved", "processing"].includes(item.status)).length;
  const packageHistory = history.filter((item) => item.source === "package");
  const generalHistory = history.filter((item) => item.source !== "package");

  function changeMethod(source: "wallet" | "package", packageId: string | undefined, methodId: string) {
    const selected = methods.find((item) => item._id === methodId);
    const stored = selected && savedAddresses.find((item) =>
      item.asset === selected.asset && item.network === selected.network && item.source === source
    );
    if (source === "wallet") {
      setGeneralForm((current) => ({ ...current, methodId, address: stored?.address || "" }));
    } else if (packageId) {
      setPackageForms((current) => ({
        ...current,
        [packageId]: { ...(current[packageId] || emptyForm), methodId, address: stored?.address || "" },
      }));
    }
    setError("");
    setMessage("");
  }

  function updateForm(source: "wallet" | "package", packageId: string | undefined, field: keyof WithdrawalForm, value: string) {
    if (source === "wallet") {
      setGeneralForm((current) => ({ ...current, [field]: value }));
    } else if (packageId) {
      setPackageForms((current) => ({
        ...current,
        [packageId]: { ...(current[packageId] || emptyForm), [field]: value },
      }));
    }
  }

  async function saveAddress(source: "wallet" | "package", packageId?: string) {
    const form = source === "wallet" ? generalForm : (packageForms[packageId || ""] || emptyForm);
    const selected = methods.find((item) => item._id === form.methodId);
    if (!selected) {
      setError("اختر وسيلة السحب أولًا");
      return;
    }
    const cleanAddress = form.address.trim();
    if (!cleanAddress) {
      setError("أدخل عنوان محفظة السحب");
      return;
    }
    const key = source === "wallet" ? "general" : String(packageId);
    setSavingAddressKey(key);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/withdrawal-addresses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset: selected.asset, network: selected.network, address: cleanAddress, source }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر حفظ عنوان السحب");
      setMessage(source === "wallet" ? "تم حفظ عنوان السحب العام." : "تم حفظ عنوان سحب الباقات.");
      await load();
      updateForm(source, packageId, "address", cleanAddress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ العنوان");
    } finally {
      setSavingAddressKey("");
    }
  }

  async function submitWithdrawal(event: FormEvent<HTMLFormElement>, source: "wallet" | "package", packageAccount?: PackageAccount) {
    event.preventDefault();
    const key = source === "wallet" ? "general" : String(packageAccount?._id || "");
    const form = source === "wallet" ? generalForm : (packageForms[packageAccount?._id || ""] || emptyForm);
    const selectedMethod = methods.find((item) => item._id === form.methodId);
    setError("");
    setMessage("");

    if (!selectedMethod) {
      setError("لا توجد وسيلة سحب مفعلة من الإدارة. أضف وسيلة سحب من لوحة الأدمن أولًا.");
      return;
    }
    const numericAmount = Number(form.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("أدخل مبلغ سحب صحيحًا");
      return;
    }
    if (!form.address.trim()) {
      setError("أدخل عنوان محفظتك لاستلام السحب");
      return;
    }

    if (source === "package") {
      if (!packageAccount) {
        setError("تعذر تحديد الباقة المطلوبة");
        return;
      }
      if (packageAccount.firstWithdrawalStatus === "pending") {
        setError("يوجد أول طلب سحب قيد المراجعة لهذه الباقة.");
        return;
      }
      const max = packageMaximum(packageAccount);
      if (numericAmount > max) {
        setError(max > 0
          ? "الحد المتاح للسحب من باقة " + packageAccount.packageName + " هو " + money(max) + " USDT."
          : "لا يوجد حد سحب متاح حاليًا من باقة " + packageAccount.packageName + ".");
        return;
      }
    } else {
      const currentBalance = Number(balances.find((item) => item.asset === selectedMethod.asset)?.available || 0);
      if (numericAmount > currentBalance) {
        setError("رصيد السحب العام غير كافٍ. المتاح هو " + money(currentBalance) + " " + selectedMethod.asset + ".");
        return;
      }
    }

    const minimum = source === "package"
      ? Math.max(Number(selectedMethod.minWithdrawal || 0), Number(packageAccount?.minimumWithdrawal || 0))
      : Math.max(Number(selectedMethod.minWithdrawal || 0), Number(limits.minGeneralWithdrawal ?? limits.minWithdrawal ?? 0));
    const configuredMaximums = [Number(selectedMethod.maxWithdrawal || 0), Number(limits.maxWithdrawal || 0)].filter((value) => value > 0);
    const maximum = configuredMaximums.length ? Math.min(...configuredMaximums) : 0;
    if (numericAmount < minimum) {
      setError("الحد الأدنى للسحب هو " + money(minimum) + " " + selectedMethod.asset);
      return;
    }
    if (maximum > 0 && numericAmount > maximum) {
      setError("الحد الأقصى للسحب هو " + money(maximum) + " " + selectedMethod.asset);
      return;
    }

    setSubmittingKey(key);
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: selectedMethod.asset,
          network: selectedMethod.network,
          address: form.address.trim(),
          amount: numericAmount,
          source,
          userPackageId: source === "package" ? packageAccount?._id : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر إرسال طلب السحب");
      setMessage(data.message || "تم إرسال طلب السحب بنجاح، وهو الآن قيد المراجعة.");
      updateForm(source, packageAccount?._id, "amount", "");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال طلب السحب");
    } finally {
      setSubmittingKey("");
    }
  }

  function renderMethodOptions(onlyUsdt: boolean) {
    const options = methods.filter((item) => !onlyUsdt || item.asset === "USDT");
    return options.map((item) => (
      <option key={item._id} value={item._id}>{item.name} — {item.asset} / {item.network}</option>
    ));
  }

  function requestCard(item: Withdrawal) {
    const packageName = typeof item.userPackageId === "object" && item.userPackageId?.packageName
      ? item.userPackageId.packageName
      : packageAccounts.find((entry) => entry._id === String(item.userPackageId || ""))?.packageName;
    return (
      <article key={item._id} className="rounded-2xl border border-white/10 bg-[#050a13] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black">{money(item.amount)} {item.asset}</div>
            <div className="mt-1 text-xs text-slate-500">{item.network} · {item.source === "package" ? "سحب من باقة" : "سحب عام"}</div>
            {item.source === "package" && <div className="mt-1 text-xs text-emerald-200">{packageName || "حساب باقة"}</div>}
          </div>
          <span className={"rounded-full border px-3 py-1 text-xs font-bold " + statusClass(item.status)}>{statusLabel(item.status)}</span>
        </div>
        <div className="mt-3 break-all text-xs text-slate-500">{item.address}</div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>{item.createdAt ? new Date(item.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "—"}</span>
          {item.fee !== undefined && <span>الرسوم: {money(Number(item.fee || 0))} · الصافي: {money(Number(item.receiveAmount ?? (item.amount - Number(item.fee || 0))))} {item.asset}</span>}
        </div>
        {item.adminNote && <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] p-3 text-xs text-slate-400">ملاحظة الإدارة: {item.adminNote}</div>}
      </article>
    );
  }

  function renderWithdrawalFields(source: "wallet" | "package", packageAccount?: PackageAccount) {
    const packageId = packageAccount?._id;
    const key = source === "wallet" ? "general" : String(packageId);
    const form = source === "wallet" ? generalForm : (packageForms[packageId || ""] || emptyForm);
    const selected = methods.find((item) => item._id === form.methodId) || null;
    const available = source === "package"
      ? Number(packageAccount?.availableEarnings || 0)
      : Number(balances.find((item) => item.asset === selected?.asset)?.available || 0);
    const minimum = source === "package"
      ? Math.max(Number(selected?.minWithdrawal || 0), Number(packageAccount?.minimumWithdrawal || 0))
      : Math.max(Number(selected?.minWithdrawal || 0), Number(limits.minGeneralWithdrawal ?? limits.minWithdrawal ?? 0));
    const configuredMaximums = [Number(selected?.maxWithdrawal || 0), Number(limits.maxWithdrawal || 0)].filter((value) => value > 0);
    const maximum = configuredMaximums.length ? Math.min(...configuredMaximums) : undefined;
    const packageMax = packageAccount ? packageMaximum(packageAccount) : 0;
    const packagePending = packageAccount?.firstWithdrawalStatus === "pending";
    const savedAddress = selected && savedAddresses.some((item) =>
      item.asset === selected.asset && item.network === selected.network && item.source === source
    );
    const isSubmitting = submittingKey === key;
    const isSaving = savingAddressKey === key;
    return (
      <form onSubmit={(event) => void submitWithdrawal(event, source, packageAccount)} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold">وسيلة السحب / العملة والشبكة</label>
          <select value={form.methodId} onChange={(event) => changeMethod(source, packageId, event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/50">
            <option value="">اختر وسيلة السحب</option>
            {renderMethodOptions(source === "package")}
          </select>
          {methods.length === 0 && <p className="mt-2 text-xs text-amber-200">الأدمن لم يفعّل أي وسيلة سحب بعد؛ الخانات موجودة لكن لن يتم إرسال الطلب حتى تفعيل وسيلة.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="text-xs text-slate-500">الرصيد المتاح في {source === "package" ? "هذه الباقة" : "السحب العام"}</div>
            <div className="mt-2 text-xl font-black text-cyan-100">{money(available)} <span className="text-xs">{selected?.asset || "USDT"}</span></div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="text-xs text-slate-500">الحد الأدنى للسحب</div>
            <div className="mt-2 text-xl font-black">{selected ? money(minimum) : "—"} <span className="text-xs">{selected?.asset || ""}</span></div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-sm font-bold">عنوان محفظتك لاستلام السحب</label>
            <span className="text-xs text-slate-500">{savedAddress ? "يوجد عنوان محفوظ لهذه الشبكة" : "أدخل عنوان الاستلام الخاص بك"}</span>
          </div>
          <p className="mb-2 text-xs leading-5 text-slate-500">هذا عنوان محفظتك أنت لاستلام الأموال، وليس عنوان الإيداع الذي يحدده الأدمن.</p>
          <textarea value={form.address} onChange={(event) => updateForm(source, packageId, "address", event.target.value)} rows={2} required placeholder="أدخل عنوان محفظة الاستلام" className="w-full resize-y rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/50" />
          <button type="button" onClick={() => void saveAddress(source, packageId)} disabled={isSaving || !form.address.trim() || !selected} className="mt-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-2 text-xs font-bold text-cyan-200 disabled:opacity-40">
            {isSaving ? "جاري حفظ العنوان..." : savedAddress ? "تحديث العنوان المحفوظ" : "حفظ العنوان للمرة القادمة"}
          </button>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">{source === "package" ? "مبلغ السحب من باقة " + (packageAccount?.packageName || "") : "مبلغ السحب العام"}</label>
          <input type="number" min={minimum} max={source === "package" ? Math.min(packageMax, maximum || packageMax) : maximum} step="any" value={form.amount} onChange={(event) => updateForm(source, packageId, "amount", event.target.value)} disabled={Boolean(packagePending)} required placeholder="اكتب مبلغ السحب" className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/50 disabled:opacity-50" />
          {source === "package" && <p className="mt-2 text-xs leading-5 text-slate-500">الحد الأدنى الذي حدده الأدمن لهذه الباقة: {money(Number(packageAccount?.minimumWithdrawal || 0))} USDT. والحد الأقصى المتاح الآن: {money(Math.min(packageMax, maximum || packageMax))} USDT. الطلب من هذه الخانة لا يخصم من الباقات الأخرى أو الرصيد العام.</p>}
          {source === "wallet" && selected && <p className="mt-2 text-xs text-slate-500">الحد الأدنى للسحب العام حسب إعدادات الأدمن: {money(Number(limits.minGeneralWithdrawal || limits.minWithdrawal || 0))} {selected.asset}. الرصيد المتاح: {money(available)} {selected.asset}.</p>}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm">
          <div className="flex justify-between py-1"><span className="text-slate-500">رسوم السحب</span><span>{money(Number(selected?.withdrawalFee || 0))} {selected?.asset || ""}</span></div>
          <div className="flex justify-between py-1"><span className="text-slate-500">المبلغ المتوقع استلامه</span><span className="font-black text-emerald-200">{money(Math.max(0, Number(form.amount || 0) - Number(selected?.withdrawalFee || 0)))} {selected?.asset || ""}</span></div>
          {selected?.maxWithdrawal && selected.maxWithdrawal > 0 && <div className="mt-2 text-xs text-slate-500">الحد الأعلى للعملية: {money(selected.maxWithdrawal)} {selected.asset}</div>}
        </div>
        {selected?.warning && <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm leading-6 text-amber-200">{selected.warning}</div>}
        {packagePending && <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs text-amber-200">أول طلب سحب من هذه الباقة قيد المراجعة؛ لا يمكن إرسال طلب آخر حتى تتم معالجته.</div>}

        <button type="submit" disabled={isSubmitting || !selected || (source === "package" && (!packageAccount || packagePending || packageMax <= 0))} className="w-full rounded-xl bg-cyan-300 px-5 py-4 font-black text-[#03111c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">
          {isSubmitting ? "جاري إرسال الطلب..." : source === "package" ? "إرسال طلب سحب من هذه الباقة" : "إرسال طلب السحب العام"}
        </button>
      </form>
    );
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-h-screen min-w-0 flex-1 bg-[#050a13] px-4 py-6 text-white md:px-8 md:py-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300"><ArrowDownToLine size={24} /></div>
                <div><h1 className="text-3xl font-black">السحب</h1><p className="mt-1 text-sm text-slate-400">خانة مستقلة للسحب العام وخانة مستقلة لكل باقة، مع سجل منفصل لكل نوع.</p></div>
              </div>
              <button type="button" onClick={() => { setRefreshing(true); void load(); }} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-300 disabled:opacity-50">
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> تحديث الأرصدة
              </button>
            </div>

            <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-[#18202b] to-[#07101d] p-4"><div className="text-xs text-amber-100/80">رصيد الإيداع الخارجي</div><div className="mt-3 text-2xl font-black text-amber-200">{money(totalDepositAvailable)} <span className="text-xs">USDT</span></div><p className="mt-1 text-xs leading-5 text-slate-500">للتفعيل حسب قواعد المنصة، وليس للسحب المباشر.</p></div>
              <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#0d2534] to-[#07101d] p-4"><div className="text-xs text-cyan-100/80">رصيد السحب العام</div><div className="mt-3 text-2xl font-black text-cyan-200">{money(totalGeneralAvailable)} <span className="text-xs">USDT</span></div><p className="mt-1 text-xs leading-5 text-slate-500">منفصل عن رصيد الإيداع وأرصدة الباقات.</p></div>
              <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#0e2b26] to-[#07101d] p-4"><div className="text-xs text-emerald-100/80">أرباح الباقات المتاحة</div><div className="mt-3 text-2xl font-black text-emerald-200">{money(totalPackageAvailable)} <span className="text-xs">USDT</span></div><p className="mt-1 text-xs leading-5 text-slate-500">كل باقة لها خانة ورصيد وحد مستقل.</p></div>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0d2030] to-[#07101d] p-4"><div className="text-xs text-slate-400">طلبات سحب مفتوحة</div><div className="mt-3 text-2xl font-black text-amber-200">{openWithdrawals} <span className="text-xs">طلبات</span></div><p className="mt-1 text-xs leading-5 text-slate-500">الرصيد المحجوز داخل الباقات: {money(totalPackageLocked)} USDT</p></div>
            </section>

            {error && <div role="alert" className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">{error}</div>}
            {message && <div role="status" className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200">{message}</div>}

            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-12 text-center text-slate-400">جاري تحميل الأرصدة وبيانات السحب...</div>
            ) : (
              <>
                <section className="rounded-3xl border border-cyan-400/20 bg-[#07101d] p-5 md:p-7">
                  <div className="mb-5 flex items-start gap-3"><Wallet size={24} className="mt-1 text-cyan-300" /><div><h2 className="text-xl font-black">السحب العام</h2><p className="mt-1 text-sm leading-6 text-slate-400">هذه الخانة مستقلة عن كل الباقات وتخصم من رصيد السحب العام فقط.</p><div className="mt-3 text-2xl font-black text-cyan-200">{money(totalGeneralAvailable)} USDT متاح</div></div></div>
                  {renderWithdrawalFields("wallet")}
                </section>

                <section className="mt-8 rounded-3xl border border-emerald-400/20 bg-[#07101d] p-5 md:p-7">
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">خانات السحب حسب الباقة</h2><p className="mt-1 text-sm leading-6 text-slate-400">كل حساب باقة يظهر له نموذج مستقل تلقائيًا. إضافة باقة جديدة تظهر هنا دون تعديل الصفحة.</p></div><span className="rounded-full border border-emerald-300/20 px-3 py-1 text-xs text-emerald-200">{packageAccounts.length} باقة</span></div>
                  {packageAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">لا توجد حسابات باقات بعد. عند تفعيل باقة ستظهر خانة السحب الخاصة بها هنا.</div>
                  ) : (
                    <div className="space-y-5">
                      {packageAccounts.map((item) => (
                        <article key={item._id} className="rounded-2xl border border-white/10 bg-[#050a13] p-4 md:p-6">
                          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                            <div><h3 className="text-lg font-black">{item.packageName}</h3><p className="mt-1 text-xs text-slate-500">{item.status === "active" ? "باقة نشطة" : "باقة سابقة — يمكن طلب المتاح إن سمحت قواعد السحب"}</p></div>
                            <div className="text-left"><div className="text-xs text-slate-500">الحد المتاح لهذه الباقة</div><div className="mt-1 text-xl font-black text-emerald-200">{money(packageMaximum(item))} {item.asset}</div></div>
                          </div>
                          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3"><div className="text-xs text-slate-500">متاح للسحب</div><div className="mt-2 font-black">{money(Number(item.availableEarnings || 0))} {item.asset}</div></div>
                            <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3"><div className="text-xs text-slate-500">قيد المراجعة</div><div className="mt-2 font-black">{money(Number(item.lockedEarnings || 0))} {item.asset}</div></div>
                            <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3"><div className="text-xs text-slate-500">العوائد المحققة</div><div className="mt-2 font-black">{money(Number(item.totalRealizedEarnings || 0))} {item.asset}</div></div>
                            <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3"><div className="text-xs text-slate-500">إجمالي سحب سابق</div><div className="mt-2 font-black">{money(Number(item.totalWithdrawn || 0))} {item.asset}</div></div>
                          </div>
                          {item.firstWithdrawalStatus === "pending" ? <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs text-amber-200">أول طلب سحب لهذه الباقة قيد المراجعة.</div> : <div className="mb-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs leading-5 text-slate-400">{Number(item.totalWithdrawn || 0) <= 0 && item.status === "active" ? "أول سحب يخضع للنسبة التي يحددها الأدمن، وبحد أقصى الرصيد المحقق المتاح." : "حد السحب اللاحق يعتمد على قواعد الباقة والإحالات المضبوطة من الإدارة."}{item.activeReferralCount !== undefined ? " عدد الإحالات النشطة: " + Number(item.activeReferralCount || 0) + "، المتبقي من حد الإحالات: " + money(Number(item.referralRemaining || 0)) + " USDT." : ""}</div>}
                          {renderWithdrawalFields("package", item)}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <aside className="mt-6 rounded-3xl border border-white/10 bg-[#07101d] p-5 md:p-6">
                  <div className="mb-4 flex items-center gap-3"><ShieldCheck className="text-cyan-300" size={23} /><h2 className="text-xl font-black">تفاصيل وقواعد السحب</h2></div>
                  <div className="space-y-3 text-sm leading-6 text-slate-400">
                    <p>• رصيد الإيداع الخارجي منفصل ولا يُسحب مباشرة.</p>
                    <p>• طلب السحب العام لا يغيّر أي رصيد باقة.</p>
                    <p>• كل طلب سحب من باقة يرتبط بمعرّف هذه الباقة فقط.</p>
                    <p>• يتم تطبيق الحدود والنسب التي يحددها الأدمن، مع خصم الرسوم المعروضة.</p>
                    <p>• جميع الطلبات تخضع للمراجعة؛ الطلب المعلق لا يمكن تكراره على المبلغ المحجوز.</p>
                    <p>• تأكد من صحة عنوان الاستلام والشبكة قبل الإرسال.</p>
                  </div>
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 size={15} />الطلبات قيد المراجعة</div><div className="mt-2 text-2xl font-black text-amber-200">{openWithdrawals}</div></div>
                </aside>

                <section className="mt-8 rounded-3xl border border-purple-400/20 bg-[#07131f]/80 p-5 md:p-7">
                  <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">طلبات السحب العام</h2><p className="mt-1 text-xs text-slate-500">سجل منفصل لطلبات السحب من المحفظة العامة.</p></div><span className="rounded-full border border-purple-300/20 px-3 py-1 text-xs text-purple-200">{generalHistory.length} طلب</span></div>
                  {generalHistory.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">لا توجد طلبات سحب عام حتى الآن.</div> : <div className="grid gap-3 lg:grid-cols-2">{generalHistory.map(requestCard)}</div>}
                </section>
                <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-[#07131f]/80 p-5 md:p-7">
                  <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">طلبات سحب الباقات</h2><p className="mt-1 text-xs text-slate-500">كل طلب يظهر بجوار اسم حساب الباقة المرتبط به.</p></div><span className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs text-cyan-200">{packageHistory.length} طلب</span></div>
                  {packageHistory.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">لا توجد طلبات سحب من الباقات حتى الآن.</div> : <div className="grid gap-3 lg:grid-cols-2">{packageHistory.map(requestCard)}</div>}
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
