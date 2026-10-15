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
type PackagePlan = { _id: string; name: string; asset?: string; minimumWithdrawal?: number; enabled?: boolean };
type SavedAddress = { _id: string; asset: string; network: string; address: string; source: "wallet" | "package" };
type PackageAccount = {
  _id: string;
  packageName: string;
  packageId?: string | { _id?: string };
  asset: string;
  status: "active" | "cancelled";
  availableEarnings: number;
  lockedEarnings: number;
  investedAmount: number;
  durationDays?: number;
  totalRealizedEarnings: number;
  totalWithdrawn: number;
  firstWithdrawalStatus?: "available" | "pending" | "approved" | "completed";
  firstPackageWithdrawalCap?: number;
  firstPackageWithdrawalUsed?: number;
  firstPackageWithdrawalRemaining?: number;
  firstPackageWithdrawalPending?: boolean;
  packageWithdrawalPending?: boolean;
  unresolvedWithdrawalAmount?: number | null;
  unresolvedWithdrawalStatus?: string | null;
  packageWithdrawalCap?: number;
  packageWithdrawalUsed?: number;
  packageWithdrawalRemaining?: number;
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
function sanitizeAmountInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  return dot < 0 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}
const statusLabel = (status: string) => status === "completed" ? "مكتمل" : status === "approved" ? "تمت الموافقة" : status === "processing" ? "قيد التنفيذ" : status === "rejected" ? "مرفوض" : status === "failed" ? "فشل التنفيذ" : "قيد المراجعة";
const statusClass = (status: string) => status === "completed" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : status === "rejected" || status === "failed" ? "border-red-400/20 bg-red-400/10 text-red-200" : status === "approved" || status === "processing" ? "border-blue-400/20 bg-blue-400/10 text-blue-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200";

function packageMaximum(item: PackageAccount) {
  // Show and enforce the smaller of the actual package balance and the current phase cap.
  const available = Math.max(0, Number(item.availableEarnings || 0));
  const cap = item.withdrawalLimit === undefined
    ? available
    : Math.max(0, Number(item.withdrawalLimit || 0));
  return Math.min(available, cap);
}

function packagePlanId(item: PackageAccount) {
  const id = item.packageId;
  return typeof id === "object" && id ? String(id._id || "") : String(id || "");
}

function accountForPackagePlan(planId: string, accounts: PackageAccount[]) {
  return accounts
    .filter((item) => packagePlanId(item) === planId)
    .sort((a, b) => Number(b.availableEarnings || 0) - Number(a.availableEarnings || 0))[0];
}

export default function WithdrawPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [limits, setLimits] = useState<PaymentLimits>({ minDeposit: 0, maxDeposit: 0, minWithdrawal: 0, minGeneralWithdrawal: 0, maxWithdrawal: 0, dailyWithdrawalLimit: 0 });
  const [balances, setBalances] = useState<Balance[]>([]);
  const [packageAccounts, setPackageAccounts] = useState<PackageAccount[]>([]);
  const [packagePlans, setPackagePlans] = useState<PackagePlan[]>([]);
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
      const planRows: PackagePlan[] = Array.isArray(packageData.packages)
        ? packageData.packages.filter((item: PackagePlan) => item && item._id && item.enabled !== false)
        : [];
      const activePlanIds = new Set(planRows.map((item) => String(item._id)));
      const packageRows: PackageAccount[] = Array.isArray(packageData.userPackages)
        ? packageData.userPackages.filter((item: PackageAccount) =>
            ["active", "cancelled"].includes(item.status) &&
            String(item.asset || "").toUpperCase() === "USDT" &&
            activePlanIds.has(packagePlanId(item))
          )
        : [];
      const loadedAddresses: SavedAddress[] = Array.isArray(addressesData.addresses) ? addressesData.addresses : [];
      const generalMethods = methodRows;
      const packageMethods = methodRows.filter((item) => item.asset === "USDT");

      setMethods(methodRows);
      setBalances(Array.isArray(walletData.generalWithdrawalBalances) ? walletData.generalWithdrawalBalances : (walletData.spot?.balances || walletData.wallet?.balances || []));
      setHistory(Array.isArray(historyData.withdrawals) ? historyData.withdrawals : []);
      setSavedAddresses(loadedAddresses);
      setPackagePlans(planRows);
      setPackageAccounts(packageRows);

      setGeneralForm((current) => {
        const methodId = generalMethods.some((item) => item._id === current.methodId) ? current.methodId : (generalMethods[0]?._id || "");
        const selected = generalMethods.find((item) => item._id === methodId);
        const stored = selected && loadedAddresses.find((item) => item.asset === selected.asset && item.network === selected.network && item.source === "wallet");
        return { ...current, methodId, address: current.address || stored?.address || "" };
      });
      setPackageForms((current) => {
        const next: Record<string, WithdrawalForm> = { ...current };
        for (const plan of planRows) {
          const account = accountForPackagePlan(String(plan._id), packageRows);
          const formId = account?._id || String(plan._id);
          const old = next[formId] || next[String(plan._id)] || emptyForm;
          const methodId = packageMethods.some((item) => item._id === old.methodId) ? old.methodId : (packageMethods[0]?._id || "");
          const selected = packageMethods.find((item) => item._id === methodId);
          const stored = selected && loadedAddresses.find((item) => item.asset === selected.asset && item.network === selected.network && item.source === "package");
          next[formId] = { ...old, methodId, address: old.address || stored?.address || "" };
          if (account && formId !== String(plan._id)) delete next[String(plan._id)];
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
  const pendingWithdrawal = history.find((item) => item.status === "pending");
  const hasPendingWithdrawal = Boolean(pendingWithdrawal);
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

  async function submitWithdrawal(event: FormEvent<HTMLFormElement>, source: "wallet" | "package", packageAccount?: PackageAccount, packageFormId?: string) {
    event.preventDefault();
    const packageKey = packageFormId || packageAccount?._id || "";
    const key = source === "wallet" ? "general" : String(packageKey);
    const form = source === "wallet" ? generalForm : (packageForms[packageKey] || emptyForm);
    const selectedMethod = methods.find((item) => item._id === form.methodId);
    setError("");
    setMessage("");

    if (hasPendingWithdrawal) {
      setError("لديك طلب سحب قيد المراجعة بالفعل. لا يمكنك تقديم طلب آخر حتى تقرر الإدارة الموافقة على الطلب الحالي أو رفضه.");
      return;
    }

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
      const max = packageMaximum(packageAccount);
      const lifetimeCap = Math.max(0, Number(packageAccount.packageWithdrawalCap ?? packageAccount.investedAmount ?? 0));
      const lifetimeUsed = Math.max(0, Number(packageAccount.packageWithdrawalUsed || 0));
      const lifetimeRemaining = Math.max(0, Number(packageAccount.packageWithdrawalRemaining ?? max));
      if (numericAmount > max) {
        if (lifetimeRemaining <= 1e-8) {
          setError("تم بلوغ سقف السحب الإجمالي لباقة " + packageAccount.packageName + " وهو " + money(lifetimeCap) + " USDT. الطلبات المعلقة والموافق عليها والمكتملة محسوبة ضمن الإجمالي (" + money(lifetimeUsed) + " USDT).");
        } else if (numericAmount > lifetimeRemaining) {
          setError("المتبقي من سقف السحب الإجمالي لباقة " + packageAccount.packageName + " هو " + money(lifetimeRemaining) + " USDT فقط.");
        } else {
          setError("المتاح للسحب الآن من باقة " + packageAccount.packageName + " هو " + money(max) + " USDT فقط؛ تم احتساب الرصيد وسقف السحب والطلبات السابقة.");
        }
        return;
      }
    } else {
      const currentBalance = Number(balances.find((item) => item.asset === selectedMethod.asset)?.available || 0);
      if (numericAmount > currentBalance) {
        setError("رصيد السحب العام المتاح هو " + money(currentBalance) + " " + selectedMethod.asset + " فقط. أدخل مبلغًا لا يتجاوز الرصيد المتاح.");
        return;
      }
    }

    const minimum = source === "package"
      ? Math.max(Number(selectedMethod.minWithdrawal || 0), Number(packageAccount?.minimumWithdrawal || 0))
      : Math.max(Number(selectedMethod.minWithdrawal || 0), Number(limits.minGeneralWithdrawal ?? limits.minWithdrawal ?? 0));
    const configuredMaximums = [Number(selectedMethod.maxWithdrawal || 0), Number(limits.maxWithdrawal || 0)].filter((value) => value > 0);
    const maximum = configuredMaximums.length ? Math.min(...configuredMaximums) : 0;
    const firstRemainder = Number(packageAccount?.firstPackageWithdrawalRemaining || 0);
    const finalFirstAllowanceBelowMinimum =
      source === "package" &&
      Boolean(packageAccount) &&
      packageAccount?.firstPackageWithdrawalPending !== true &&
      firstRemainder > 0 &&
      firstRemainder < minimum &&
      Math.abs(numericAmount - firstRemainder) <= 1e-8 &&
      Number(packageAccount?.availableEarnings || 0) >= firstRemainder;
    if (numericAmount < minimum && !finalFirstAllowanceBelowMinimum) {
      setError((source === "package" ? "أقل مبلغ يمكن سحبه من باقة " + (packageAccount?.packageName || "") : "أقل مبلغ يمكن سحبه") + " هو " + money(minimum) + " " + selectedMethod.asset + ". أدخل مبلغًا مساويًا للحد الأدنى أو أكبر، مع عدم تجاوز الرصيد المتاح.");
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
      updateForm(source, packageKey, "amount", "");
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

  function renderWithdrawalFields(source: "wallet" | "package", packageAccount?: PackageAccount, packagePlan?: PackagePlan) {
    const packageId = packageAccount?._id || packagePlan?._id;
    const key = source === "wallet" ? "general" : String(packageId || "");
    const form = source === "wallet" ? generalForm : (packageForms[packageId || ""] || emptyForm);
    const selected = methods.find((item) => item._id === form.methodId) || null;
    const packageMax = packageAccount ? packageMaximum(packageAccount) : 0;
    const available = source === "package"
      ? packageMax
      : Number(balances.find((item) => item.asset === selected?.asset)?.available || 0);
    const minimum = source === "package"
      ? Math.max(Number(selected?.minWithdrawal || 0), Number(packageAccount?.minimumWithdrawal ?? packagePlan?.minimumWithdrawal ?? 100))
      : Math.max(Number(selected?.minWithdrawal || 0), Number(limits.minGeneralWithdrawal ?? limits.minWithdrawal ?? 0));
    const configuredMaximums = [Number(selected?.maxWithdrawal || 0), Number(limits.maxWithdrawal || 0)].filter((value) => value > 0);
    const maximum = configuredMaximums.length ? Math.min(...configuredMaximums) : undefined;
    const savedAddress = selected && savedAddresses.some((item) =>
      item.asset === selected.asset && item.network === selected.network && item.source === source
    );
    const isSubmitting = submittingKey === key;
    const isSaving = savingAddressKey === key;
    return (
      <form onSubmit={(event) => void submitWithdrawal(event, source, packageAccount, packageId)} className="grid grid-cols-2 items-start gap-2">
        <div className={source === "package" ? "col-span-2 min-w-0" : "min-w-0"}>
          <select aria-label="وسيلة السحب" value={form.methodId} onChange={(event) => changeMethod(source, packageId, event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#050a13] px-2 py-1.5 text-xs outline-none focus:border-cyan-400/50">
            <option value="">اختر الوسيلة</option>
            {methods.filter((item) => source !== "package" || item.asset === "USDT").map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </select>
          {methods.length === 0 && <p className="mt-1 text-[10px] text-amber-200">لا توجد وسيلة مفعّلة.</p>}
        </div>
        {source === "wallet" && (
          <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.025] px-2 py-1.5 text-[10px]">
            <span className="text-slate-500">المتاح</span>
            <strong className="mr-1 text-cyan-100">{money(available)} {selected?.asset || "USDT"}</strong>
          </div>
        )}

        <div className="min-w-0">
          <input aria-label="عنوان الاستلام" value={form.address} onChange={(event) => updateForm(source, packageId, "address", event.target.value)} required placeholder="عنوان الاستلام" className="w-full rounded-lg border border-white/10 bg-[#050a13] px-2 py-1.5 text-xs outline-none focus:border-cyan-400/50" />
          <button type="button" onClick={() => void saveAddress(source, packageId)} disabled={isSaving || !form.address.trim() || !selected} className="mt-1 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-[10px] font-bold text-cyan-200 disabled:opacity-40">
            {isSaving ? "جارٍ الحفظ…" : savedAddress ? "تحديث العنوان" : "حفظ العنوان"}
          </button>
        </div>

        <div className="min-w-0">
          <input aria-label="مبلغ السحب" type="text" inputMode="decimal" autoComplete="off" value={form.amount} onChange={(event) => updateForm(source, packageId, "amount", sanitizeAmountInput(event.target.value))} disabled={Boolean(source === "package" && (!packageAccount || packageMax <= 0))} required placeholder={source === "package" ? "مبلغ السحب" : money(minimum)} className="w-full rounded-lg border border-white/10 bg-[#050a13] px-2 py-1.5 text-xs outline-none focus:border-cyan-400/50 disabled:opacity-50" />
          {source === "wallet" && <p className="mt-1 text-[10px] leading-4 text-slate-500">أقل مبلغ للسحب: {money(minimum)} {selected?.asset || "USDT"}</p>}

        </div>

        {selected?.warning && <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-2 text-xs text-amber-200">{selected.warning}</div>}

        <button type="submit" disabled={isSubmitting || hasPendingWithdrawal || !selected || (source === "package" && (!packageAccount || packageMax <= 0))} className="col-span-2 w-full rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-black text-[#03111c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">
          {isSubmitting ? "جارٍ الإرسال…" : hasPendingWithdrawal ? "يوجد طلب قيد المراجعة" : "تأكيد السحب"}
        </button>
      </form>
    );
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-h-screen min-w-0 flex-1 bg-[#050a13] px-3 py-4 text-white md:px-5 md:py-5">
          <div className="mx-auto max-w-6xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300"><ArrowDownToLine size={24} /></div>
                <div><h1 className="text-2xl font-black">السحب</h1><p className="mt-1 text-xs text-slate-400">السحب العام وسحب كل باقة في خانات مستقلة.</p></div>
              </div>
              <button type="button" onClick={() => { setRefreshing(true); void load(); }} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-300 disabled:opacity-50">
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> تحديث الأرصدة
              </button>
            </div>

            <section className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-[#0d2534] to-[#07101d] p-3"><div className="text-[11px] text-cyan-100/80">السحب العام</div><div className="mt-1.5 text-lg font-black text-cyan-200">{money(totalGeneralAvailable)} <span className="text-[10px]">USDT</span></div></div>
              <div className="rounded-xl border border-emerald-300/20 bg-gradient-to-br from-[#0e2b26] to-[#07101d] p-3"><div className="text-[11px] text-emerald-100/80">أرباح الباقات</div><div className="mt-1.5 text-lg font-black text-emerald-200">{money(totalPackageAvailable)} <span className="text-[10px]">USDT</span></div></div>
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#0d2030] to-[#07101d] p-3"><div className="text-[11px] text-slate-400">طلبات مفتوحة · محجوز الباقات</div><div className="mt-1.5 text-lg font-black text-amber-200">{openWithdrawals} <span className="text-[10px]">طلب</span></div><div className="mt-0.5 text-[10px] text-slate-500">{money(totalPackageLocked)} USDT</div></div>
            </section>

            {error && <div role="alert" className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">{error}</div>}
            {message && <div role="status" className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200">{message}</div>}
            {pendingWithdrawal && (
              <div role="alert" className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
                لديك طلب سحب بقيمة <strong>{money(Number(pendingWithdrawal.amount || 0))} {pendingWithdrawal.asset || "USDT"}</strong> قيد المراجعة
                {pendingWithdrawal.source === "package" ? " من أرباح الباقة" : " من المحفظة العامة"}.
                تم إيقاف إرسال أي طلب سحب جديد حتى تعتمد الإدارة الطلب الحالي أو ترفضه.
              </div>
            )}

            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-12 text-center text-slate-400">جاري تحميل الأرصدة وبيانات السحب...</div>
            ) : (
              <>
                <section className="rounded-xl border border-cyan-400/20 bg-[#07101d] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-black"><Wallet size={16} className="text-cyan-300" />السحب العام</h2><span className="text-xs font-bold text-cyan-200">{money(totalGeneralAvailable)} USDT</span></div>
                  {renderWithdrawalFields("wallet")}
                </section>

                <section className="mt-3 rounded-xl border border-emerald-400/20 bg-[#07101d] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-black">السحب من الباقات</h2>
                    <span className="rounded-full border border-emerald-300/20 px-2 py-1 text-[10px] text-emerald-200">{packagePlans.length} باقات</span>
                  </div>
                  {packagePlans.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">لا توجد باقات متاحة حاليًا.</div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {packagePlans.map((plan) => {
                        const item = accountForPackagePlan(String(plan._id), packageAccounts);
                        const packageFormId = item?._id || String(plan._id);
                        const availableForPlan = item ? Math.max(0, Number(item.availableEarnings || 0)) : 0;
                        return (
                          <article key={plan._id} className="min-w-0 rounded-xl border border-white/10 bg-[#050a13] p-3">
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="break-words text-sm font-black">{plan.name}</h3>
                                <span className={item ? "mt-1 inline-flex rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200" : "mt-1 inline-flex rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-300"}>
                                  {item ? (item.status === "active" ? "نشطة" : "سابقة") : "لم تُفعّل بعد"}
                                </span>
                              </div>
                              <div className="shrink-0 text-left">
                                <div className="text-[10px] text-slate-500">متاح للسحب</div>
                                <div className="text-sm font-black text-emerald-200">{money(availableForPlan)} USDT</div>
                              </div>
                            </div>
                            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                              <span className="text-slate-500">محجوز: <b className="text-slate-200">{money(Number(item?.lockedEarnings || 0))} USDT</b></span>
                            </div>
                            {!item ? (
                              <p className="rounded-lg bg-white/[0.025] px-2 py-2 text-[10px] text-slate-500">فعّل الباقة أولًا لتتاح عمليات السحب.</p>
                            ) : (
                              <>
                                {item.firstWithdrawalStatus === "pending" && <p className="mb-2 rounded-lg bg-amber-400/[0.06] p-2 text-[10px] text-amber-200">طلب السحب الأول قيد المراجعة.</p>}
                                {renderWithdrawalFields("package", item, plan)}
                              </>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <div className="mt-2 text-[10px] text-slate-600">السحب العام منفصل عن أرباح الباقات؛ كل طلب يخضع للمراجعة.</div>

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
