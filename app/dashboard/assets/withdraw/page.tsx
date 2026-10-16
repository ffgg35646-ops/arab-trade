"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  History,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

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
  withdrawalScope?: "general" | "package";
  warning?: string;
};
type Balance = { asset: string; available: number; locked: number };
type PackagePlan = {
  _id: string;
  name: string;
  asset?: string;
  minimumWithdrawal?: number;
  enabled?: boolean;
};
type SavedAddress = {
  _id: string;
  asset: string;
  network: string;
  address: string;
  source: "wallet" | "package";
};
type PackageAccount = {
  _id: string;
  packageName: string;
  packageId?: string | { _id?: string };
  asset: string;
  status: "active" | "cancelled";
  availableEarnings: number;
  lockedEarnings: number;
  investedAmount: number;
  totalRealizedEarnings: number;
  totalWithdrawn: number;
  withdrawalBalanceDebt?: number;
  firstPackageWithdrawalRemaining?: number;
  packageWithdrawalStatus?: "pending" | "approved" | "processing" | null;
  packageWithdrawalAlreadyUsed?: boolean;
  activeReferralCount?: number;
  referralRemaining?: number;
  withdrawalLimit?: number;
  minimumWithdrawal?: number;
  activatedAt?: string;
  createdAt?: string;
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
type PaymentLimits = {
  minWithdrawal: number;
  minGeneralWithdrawal: number;
  maxWithdrawal: number;
  dailyWithdrawalLimit: number;
};
type WithdrawalForm = { methodId: string; amount: string; address: string };
type PackageCard = { key: string; plan: PackagePlan; accounts: PackageAccount[]; legacy: boolean };

const emptyForm: WithdrawalForm = { methodId: "", amount: "", address: "" };
const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
const normalizeName = (value: unknown) =>
  String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

function sanitizeAmountInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  return dot < 0 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}
function packagePlanId(item: PackageAccount) {
  const id = item.packageId;
  return typeof id === "object" && id ? String(id._id || "") : String(id || "");
}
function packageMaximum(item: PackageAccount) {
  const available = Math.max(0, Number(item.availableEarnings || 0));
  const cap = item.withdrawalLimit === undefined
    ? available
    : Math.max(0, Number(item.withdrawalLimit || 0));
  return Math.min(available, cap);
}
function statusLabel(status: string) {
  if (status === "completed") return "مكتمل";
  if (status === "approved") return "تمت الموافقة";
  if (status === "processing") return "قيد التنفيذ";
  if (status === "rejected") return "مرفوض";
  if (status === "failed") return "فشل التنفيذ";
  return "قيد المراجعة";
}
function statusClass(status: string) {
  if (status === "completed") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (status === "rejected" || status === "failed") return "border-red-400/20 bg-red-400/10 text-red-200";
  if (status === "approved" || status === "processing") return "border-blue-400/20 bg-blue-400/10 text-blue-200";
  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

export default function WithdrawPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [packageMethods, setPackageMethods] = useState<Method[]>([]);
  const [limits, setLimits] = useState<PaymentLimits>({
    minWithdrawal: 0,
    minGeneralWithdrawal: 0,
    maxWithdrawal: 0,
    dailyWithdrawalLimit: 0,
  });
  const [generalBalances, setGeneralBalances] = useState<Balance[]>([]);
  const [allWithdrawalBalances, setAllWithdrawalBalances] = useState<Balance[]>([]);
  const [depositBalances, setDepositBalances] = useState<Balance[]>([]);
  const [packageAccounts, setPackageAccounts] = useState<PackageAccount[]>([]);
  const [packagePlans, setPackagePlans] = useState<PackagePlan[]>([]);
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [generalForm, setGeneralForm] = useState<WithdrawalForm>(emptyForm);
  const [packageForms, setPackageForms] = useState<Record<string, WithdrawalForm>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingKey, setSubmittingKey] = useState("");
  const [savingAddressKey, setSavingAddressKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const urls = [
        "/api/payment-options",
        "/api/wallet?mode=live",
        "/api/withdrawals",
        "/api/withdrawal-addresses",
        "/api/packages",
      ];
      const responses = await Promise.all(
        urls.map((url) => fetch(url, { credentials: "include", cache: "no-store" })),
      );
      const payloads = await Promise.all(responses.map(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
          throw new Error(data.message || "تعذر تحميل بيانات السحب");
        }
        return data;
      }));
      const [methodData, walletData, historyData, addressData, packageData] = payloads;

      const generalMethods: Method[] = Array.isArray(methodData.methods)
        ? methodData.methods.filter((item: Method) =>
            item.enabled !== false &&
            item.withdrawalEnabled !== false &&
            item.withdrawalScope !== "package" &&
            Boolean(item._id) &&
            Boolean(item.network)
          )
        : [];
      const packageMethodRows: Method[] = Array.isArray(methodData.packageMethods)
        ? methodData.packageMethods.filter((item: Method) =>
            item.enabled !== false &&
            item.withdrawalEnabled !== false &&
            String(item.asset || "").toUpperCase() === "USDT" &&
            Boolean(item._id) &&
            Boolean(item.network)
          )
        : [];
      const rawPlans: PackagePlan[] = Array.isArray(packageData.packages)
        ? packageData.packages.filter((item: PackagePlan) => item && item._id && item.enabled !== false)
        : [];
      // Older database records can contain duplicate enabled plans with the same display name.
      // Keep one visible card per package name, preserving the first configured plan.
      const uniquePlans = new Map<string, PackagePlan>();
      for (const item of rawPlans) {
        const key = normalizeName(item.name) || String(item._id);
        if (!uniquePlans.has(key)) uniquePlans.set(key, item);
      }
      const plans = Array.from(uniquePlans.values());
      const accounts: PackageAccount[] = Array.isArray(packageData.userPackages)
        ? packageData.userPackages.filter((item: PackageAccount) =>
            ["active", "cancelled"].includes(item.status) &&
            String(item.asset || "USDT").toUpperCase() === "USDT" &&
            (
              item.status === "active" ||
              Number(item.availableEarnings || 0) > 1e-8 ||
              Number(item.lockedEarnings || 0) > 1e-8 ||
              item.packageWithdrawalStatus === "pending" ||
              item.packageWithdrawalStatus === "processing"
            )
          )
        : [];
      const addresses: SavedAddress[] = Array.isArray(addressData.addresses) ? addressData.addresses : [];

      setMethods(generalMethods);
      setPackageMethods(packageMethodRows);
      setLimits({
        minWithdrawal: Number(methodData.limits?.minWithdrawal || 0),
        minGeneralWithdrawal: Number(methodData.limits?.minGeneralWithdrawal ?? methodData.limits?.minWithdrawal ?? 0),
        maxWithdrawal: Number(methodData.limits?.maxWithdrawal || 0),
        dailyWithdrawalLimit: Number(methodData.limits?.dailyWithdrawalLimit || 0),
      });
      setGeneralBalances(Array.isArray(walletData.generalWithdrawalBalances) ? walletData.generalWithdrawalBalances : []);
      setAllWithdrawalBalances(Array.isArray(walletData.withdrawalBalances) ? walletData.withdrawalBalances : []);
      setDepositBalances(Array.isArray(walletData.depositBalances) ? walletData.depositBalances : []);
      setHistory(Array.isArray(historyData.withdrawals) ? historyData.withdrawals : []);
      setSavedAddresses(addresses);
      setPackagePlans(plans);
      setPackageAccounts(accounts);

      setGeneralForm((current) => {
        const methodId = generalMethods.some((item) => item._id === current.methodId)
          ? current.methodId
          : (generalMethods[0]?._id || "");
        const selected = generalMethods.find((item) => item._id === methodId);
        const saved = selected && addresses.find((item) =>
          item.asset === selected.asset && item.network === selected.network && item.source === "wallet"
        );
        return { ...current, methodId, address: current.address || saved?.address || "" };
      });
      setPackageForms((current) => {
        const next: Record<string, WithdrawalForm> = { ...current };
        for (const account of accounts) {
          const old = next[account._id] || emptyForm;
          const methodId = packageMethodRows.some((item) => item._id === old.methodId)
            ? old.methodId
            : (packageMethodRows[0]?._id || "");
          const selected = packageMethodRows.find((item) => item._id === methodId);
          const saved = selected && addresses.find((item) =>
            item.asset === selected.asset && item.network === selected.network && item.source === "package"
          );
          next[account._id] = { ...old, methodId, address: old.address || saved?.address || "" };
        }
        return next;
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل بيانات السحب");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void load();
    });
  }, [load]);

  const totalGeneralAvailable = useMemo(
    () => generalBalances.reduce((sum, row) =>
      sum + (String(row.asset).toUpperCase() === "USDT" ? Math.max(0, Number(row.available || 0)) : 0), 0),
    [generalBalances],
  );
  const totalAllAvailable = useMemo(
    () => allWithdrawalBalances.reduce((sum, row) =>
      sum + (String(row.asset).toUpperCase() === "USDT" ? Math.max(0, Number(row.available || 0)) : 0), 0),
    [allWithdrawalBalances],
  );
  const totalAllLocked = useMemo(
    () => allWithdrawalBalances.reduce((sum, row) =>
      sum + (String(row.asset).toUpperCase() === "USDT" ? Math.max(0, Number(row.locked || 0)) : 0), 0),
    [allWithdrawalBalances],
  );
  const totalDepositAvailable = useMemo(
    () => depositBalances.reduce((sum, row) =>
      sum + (String(row.asset).toUpperCase() === "USDT" ? Math.max(0, Number(row.available || 0)) : 0), 0),
    [depositBalances],
  );

  // One card per configured plan. Historical activation records live under that card.
  const packageCards = useMemo<PackageCard[]>(() => {
    const used = new Set<string>();
    const configured: PackageCard[] = packagePlans.map((plan) => {
      const planName = normalizeName(plan.name);
      const accounts = packageAccounts.filter((account) => {
        if (used.has(account._id)) return false;
        const accountName = normalizeName(account.packageName);
        const matches = packagePlanId(account) === String(plan._id) ||
          (Boolean(planName) && Boolean(accountName) && accountName === planName);
        if (matches) used.add(account._id);
        return matches;
      }).sort((a, b) => {
        const activeOrder = Number(b.status === "active") - Number(a.status === "active");
        if (activeOrder) return activeOrder;
        return new Date(b.activatedAt || b.createdAt || 0).getTime() -
          new Date(a.activatedAt || a.createdAt || 0).getTime();
      });
      return { key: String(plan._id), plan, accounts, legacy: false };
    });

    const legacy = new Map<string, PackageCard>();
    for (const account of packageAccounts) {
      if (used.has(account._id)) continue;
      const planId = packagePlanId(account);
      const name = normalizeName(account.packageName);
      const group = name || planId || account._id;
      const key = "legacy:" + group;
      const existing = legacy.get(key);
      if (existing) {
        existing.accounts.push(account);
      } else {
        legacy.set(key, {
          key,
          plan: {
            _id: planId || account._id,
            name: account.packageName || "باقة سابقة",
            asset: account.asset,
            minimumWithdrawal: account.minimumWithdrawal,
          },
          accounts: [account],
          legacy: true,
        });
      }
      used.add(account._id);
    }
    for (const card of legacy.values()) {
      card.accounts.sort((a, b) => new Date(b.activatedAt || b.createdAt || 0).getTime() -
        new Date(a.activatedAt || a.createdAt || 0).getTime());
    }
    return [...configured, ...legacy.values()];
  }, [packageAccounts, packagePlans]);

  const pendingRequests = useMemo(
    () => history.filter((row) => row.status === "pending" || row.status === "processing"),
    [history],
  );
  const packageHistory = history.filter((row) => row.source === "package");
  const generalHistory = history.filter((row) => row.source !== "package");

  function updateForm(source: "wallet" | "package", accountId: string | undefined, field: keyof WithdrawalForm, value: string) {
    if (source === "wallet") {
      setGeneralForm((current) => ({ ...current, [field]: value }));
      return;
    }
    if (accountId) {
      setPackageForms((current) => ({
        ...current,
        [accountId]: { ...(current[accountId] || emptyForm), [field]: value },
      }));
    }
  }

  function changeMethod(source: "wallet" | "package", accountId: string | undefined, methodId: string) {
    const selected = (source === "wallet" ? methods : packageMethods).find((item) => item._id === methodId);
    const saved = selected && savedAddresses.find((item) =>
      item.asset === selected.asset && item.network === selected.network && item.source === source
    );
    if (source === "wallet") {
      setGeneralForm((current) => ({ ...current, methodId, address: saved?.address || "" }));
    } else if (accountId) {
      setPackageForms((current) => ({
        ...current,
        [accountId]: { ...(current[accountId] || emptyForm), methodId, address: saved?.address || "" },
      }));
    }
  }

  async function saveAddress(source: "wallet" | "package", accountId?: string) {
    const form = source === "wallet" ? generalForm : (packageForms[accountId || ""] || emptyForm);
    const selected = (source === "wallet" ? methods : packageMethods).find((item) => item._id === form.methodId);
    if (!selected) {
      setError("اختار وسيلة سحب مفعّلة الأول.");
      return;
    }
    if (!form.address.trim()) {
      setError("اكتب عنوان محفظة الاستلام الأول.");
      return;
    }
    const key = source === "wallet" ? "general" : String(accountId || "");
    setSavingAddressKey(key);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/withdrawal-addresses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: selected.asset,
          network: selected.network,
          address: form.address.trim(),
          source,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر حفظ العنوان");
      setMessage(source === "wallet" ? "اتحفظ عنوان السحب العام." : "اتحفظ عنوان سحب الباقات.");
      await load();
      updateForm(source, accountId, "address", form.address.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ العنوان");
    } finally {
      setSavingAddressKey("");
    }
  }

  async function submitWithdrawal(
    event: FormEvent<HTMLFormElement>,
    source: "wallet" | "package",
    account?: PackageAccount,
  ) {
    event.preventDefault();
    const accountId = account?._id;
    const key = source === "wallet" ? "general" : String(accountId || "");
    const form = source === "wallet" ? generalForm : (packageForms[accountId || ""] || emptyForm);
    const selected = (source === "wallet" ? methods : packageMethods).find((item) => item._id === form.methodId);
    setError("");
    setMessage("");

    if (!selected) {
      setError(source === "package"
        ? "مفيش وسيلة سحب باقات مفعّلة. راجع إعدادات وسائل السحب في الأدمن."
        : "مفيش وسيلة سحب عامة مفعّلة. راجع إعدادات وسائل السحب في الأدمن.");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("اكتب مبلغ سحب صحيح.");
      return;
    }
    if (!form.address.trim()) {
      setError("اكتب عنوان محفظة الاستلام.");
      return;
    }

    if (source === "package") {
      if (!account) {
        setError("تعذر تحديد حساب الباقة.");
        return;
      }
      const max = packageMaximum(account);
      if (amount > max + 1e-8) {
        const firstRemaining = Math.max(0, Number(account.firstPackageWithdrawalRemaining || 0));
        const phaseTwo = account.packageWithdrawalAlreadyUsed === true || firstRemaining <= 1e-8;
        if (phaseTwo && Number(account.activeReferralCount || 0) <= 0) {
          setError("لا يوجد حد سحب متاح حاليًا؛ يلزم وجود إحالات نشطة حسب سياسة الباقة.");
        } else if (phaseTwo && Number(account.referralRemaining || 0) <= 1e-8) {
          setError("لا يوجد حد سحب متاح مقابل الإحالات النشطة حاليًا.");
        } else {
          setError("المتاح للسحب من حساب الباقة ده هو " + money(max) + " USDT.");
        }
        return;
      }
    } else {
      const currentAvailable = Number(generalBalances.find((row) =>
        String(row.asset).toUpperCase() === String(selected.asset).toUpperCase()
      )?.available || 0);
      if (amount > currentAvailable + 1e-8) {
        setError("الرصيد العام المتاح للسحب هو " + money(currentAvailable) + " " + selected.asset + ".");
        return;
      }
    }

    const minimum = source === "package"
      ? Math.max(Number(selected.minWithdrawal || 0), Number(account?.minimumWithdrawal ?? 100))
      : Math.max(Number(selected.minWithdrawal || 0), Number(limits.minGeneralWithdrawal || limits.minWithdrawal || 0));
    const maximums = [
      Number(selected.maxWithdrawal || 0),
      ...(source === "wallet" ? [Number(limits.maxWithdrawal || 0)] : []),
    ].filter((value) => value > 0);
    const maximum = maximums.length ? Math.min(...maximums) : 0;
    if (amount < minimum) {
      setError("الحد الأدنى للسحب هو " + money(minimum) + " " + selected.asset + ".");
      return;
    }
    if (maximum > 0 && amount > maximum) {
      setError("الحد الأقصى للسحب هو " + money(maximum) + " " + selected.asset + ".");
      return;
    }

    setSubmittingKey(key);
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: selected.asset,
          network: selected.network,
          address: form.address.trim(),
          amount,
          source,
          userPackageId: source === "package" ? account?._id : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر إرسال طلب السحب");
      setMessage(data.message || "اتسجل طلب السحب وبقى قيد المراجعة.");
      updateForm(source, accountId, "amount", "");
      await load();
    } catch (cause) {
      const submitError = cause instanceof Error ? cause.message : "تعذر إرسال طلب السحب";
      await load();
      setError(submitError);
    } finally {
      setSubmittingKey("");
    }
  }

  function renderWithdrawalForm(source: "wallet" | "package", account?: PackageAccount, plan?: PackagePlan) {
    const accountId = account?._id;
    const key = source === "wallet" ? "general" : String(accountId || "");
    const form = source === "wallet" ? generalForm : (packageForms[accountId || ""] || emptyForm);
    const options = source === "wallet" ? methods : packageMethods;
    const selected = options.find((item) => item._id === form.methodId);
    const minimum = source === "package"
      ? Math.max(Number(selected?.minWithdrawal || 0), Number(account?.minimumWithdrawal ?? plan?.minimumWithdrawal ?? 100))
      : Math.max(Number(selected?.minWithdrawal || 0), Number(limits.minGeneralWithdrawal || limits.minWithdrawal || 0));
    const max = account ? packageMaximum(account) : Number(generalBalances.find((row) =>
      String(row.asset).toUpperCase() === String(selected?.asset || "USDT").toUpperCase()
    )?.available || 0);
    const submitting = submittingKey === key;
    const saving = savingAddressKey === key;
    const addressIsSaved = Boolean(selected && savedAddresses.some((row) =>
      row.asset === selected.asset && row.network === selected.network && row.source === source
    ));
    return (
      <form onSubmit={(event) => void submitWithdrawal(event, source, account)} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-bold text-slate-300">وسيلة السحب</span>
            <select
              required
              value={form.methodId}
              onChange={(event) => changeMethod(source, accountId, event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-white outline-none focus:border-emerald-400/60"
            >
              <option value="">اختار وسيلة السحب</option>
              {options.map((item) => (
                <option key={item._id} value={item._id}>{item.name} — {item.asset} / {item.network}</option>
              ))}
            </select>
            {!options.length && <span className="mt-1 block text-xs text-amber-300">لا توجد وسيلة مفعّلة لهذا النوع من السحب.</span>}
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-bold text-slate-300">مبلغ السحب (USDT)</span>
            <input
              required
              inputMode="decimal"
              autoComplete="off"
              value={form.amount}
              onChange={(event) => updateForm(source, accountId, "amount", sanitizeAmountInput(event.target.value))}
              placeholder={"الحد الأدنى " + money(minimum)}
              className="w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-white outline-none focus:border-emerald-400/60"
            />
            <span className="mt-1 block text-[11px] text-slate-500">المتاح في الحساب: {money(max)} USDT · الحد الأدنى: {money(minimum)} USDT</span>
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-300">عنوان محفظة الاستلام</span>
          <input
            required
            value={form.address}
            onChange={(event) => updateForm(source, accountId, "address", event.target.value)}
            placeholder="الصق عنوان USDT هنا"
            autoComplete="off"
            className="w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-white outline-none focus:border-emerald-400/60"
          />
          <button
            type="button"
            onClick={() => void saveAddress(source, accountId)}
            disabled={saving || !form.address.trim() || !selected}
            className="mt-2 text-xs font-bold text-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "جارٍ حفظ العنوان..." : addressIsSaved ? "تحديث العنوان المحفوظ" : "حفظ العنوان لهذه الشبكة"}
          </button>
        </label>

        {selected?.warning && (
          <p className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100">{selected.warning}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-[#062016] transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? <RefreshCw size={16} className="animate-spin" /> : <ArrowDownToLine size={16} />}
          {submitting ? "جارٍ إرسال الطلب..." : "تأكيد السحب"}
        </button>
      </form>
    );
  }

  function renderPackageAccount(account: PackageAccount, plan: PackagePlan) {
    const policyLimit = packageMaximum(account);
    const formMinimum = Math.max(
      Number(packageMethods.find((method) => method._id === (packageForms[account._id] || emptyForm).methodId)?.minWithdrawal || 0),
      Number(account.minimumWithdrawal ?? plan.minimumWithdrawal ?? 100),
    );
    return (
      <div key={account._id} className="rounded-xl border border-white/10 bg-[#050b14] p-3 md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold">{account.status === "active" ? "حساب تفعيل نشط" : "رصيد تفعيل سابق"}</div>
            <div className="mt-1 text-[11px] text-slate-500">
              {account.activatedAt
                ? "تاريخ التفعيل: " + new Date(account.activatedAt).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" })
                : "سجل تفعيل محفوظ"}
            </div>
            {account.packageWithdrawalStatus === "pending" && (
              <div className="mt-2 inline-flex rounded-full bg-amber-300/10 px-2.5 py-1 text-[10px] text-amber-200">طلب مرتبط بالحساب: قيد المراجعة</div>
            )}
            {account.packageWithdrawalStatus === "processing" && (
              <div className="mt-2 inline-flex rounded-full bg-blue-300/10 px-2.5 py-1 text-[10px] text-blue-200">طلب مرتبط بالحساب: قيد التنفيذ</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-left sm:grid-cols-3">
            <div>
              <div className="text-[10px] text-slate-500">المتاح</div>
              <div className="text-sm font-black text-emerald-200">{money(Math.max(0, Number(account.availableEarnings || 0) - Number(account.withdrawalBalanceDebt || 0)))} USDT</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">المحجوز</div>
              <div className="text-sm font-bold text-amber-200">{money(account.lockedEarnings)} USDT</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">المسموح الآن</div>
              <div className="text-sm font-bold text-slate-100">{money(policyLimit)} USDT</div>
            </div>
          </div>
        </div>
        <div className="mt-3 border-t border-white/5 pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-300">طلب سحب من الحساب ده</span>
            <span className="text-[10px] text-slate-500">الحد الأدنى {money(formMinimum)} USDT</span>
          </div>
          {renderWithdrawalForm("package", account, plan)}
        </div>
      </div>
    );
  }

  function renderRequest(item: Withdrawal) {
    const packageName = typeof item.userPackageId === "object" && item.userPackageId?.packageName
      ? item.userPackageId.packageName
      : packageAccounts.find((account) => account._id === String(item.userPackageId || ""))?.packageName;
    return (
      <article key={item._id} className="rounded-xl border border-white/10 bg-[#091321] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black text-white">{money(item.amount)} {item.asset}</div>
            <p className="mt-1 text-xs text-slate-400">{item.source === "package" ? "سحب من باقة" : "سحب عام"} · {item.network}</p>
            {item.source === "package" && <p className="mt-1 text-xs text-emerald-300">{packageName || "حساب باقة"}</p>}
          </div>
          <span className={"rounded-full border px-3 py-1 text-xs font-bold " + statusClass(item.status)}>{statusLabel(item.status)}</span>
        </div>
        <p className="mt-3 break-all text-xs text-slate-400">{item.address}</p>
        <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-white/5 pt-3 text-[11px] text-slate-500">
          <span>{item.createdAt ? new Date(item.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "—"}</span>
          <span>الرسوم {money(Number(item.fee || 0))} · الصافي {money(Number(item.receiveAmount ?? (item.amount - Number(item.fee || 0))))} {item.asset}</span>
        </div>
        {item.adminNote && <p className="mt-3 rounded-lg bg-white/[0.03] p-3 text-xs text-slate-300">ملاحظة الإدارة: {item.adminNote}</p>}
      </article>
    );
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-h-screen min-w-0 flex-1 bg-[#050a13] px-3 py-4 text-white md:px-6 md:py-6">
          <div className="mx-auto max-w-6xl">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                  <ArrowDownToLine size={23} />
                </div>
                <div>
                  <h1 className="text-2xl font-black">السحب والأرصدة</h1>
                  <p className="mt-1 text-sm text-slate-400">كل رصيد ظاهر بمصدره، وكل طلب مرتبط بالحساب اللي اتسحب منه.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setRefreshing(true); void load(); }}
                disabled={refreshing || loading}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-200 hover:bg-white/[0.06] disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                تحديث الأرصدة
              </button>
            </header>

            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm leading-6 text-red-200">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {message && (
              <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-100">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <span>{message}</span>
              </div>
            )}

            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-[#08111e] p-12 text-center text-slate-400">
                <RefreshCw size={24} className="mx-auto mb-3 animate-spin" />
                جاري تحميل بيانات الحساب...
              </div>
            ) : (
              <>
                <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#0b2822] to-[#08111e] p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-100/80"><Wallet size={15} /> إجمالي المتاح للسحب</div>
                    <div className="mt-3 text-2xl font-black text-emerald-200">{money(totalAllAvailable)} <span className="text-xs">USDT</span></div>
                    <p className="mt-1 text-[11px] text-emerald-100/50">المحفظة العامة + أرصدة الباقات</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#0b2230] to-[#08111e] p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-cyan-100/80"><Wallet size={15} /> السحب العام المتاح</div>
                    <div className="mt-3 text-2xl font-black text-cyan-200">{money(totalGeneralAvailable)} <span className="text-xs">USDT</span></div>
                    <p className="mt-1 text-[11px] text-cyan-100/50">لا يشمل رصيد الإيداع الخارجي</p>
                  </div>
                  <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-[#2b2110] to-[#08111e] p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-100/80"><Clock3 size={15} /> المبالغ المحجوزة</div>
                    <div className="mt-3 text-2xl font-black text-amber-200">{money(totalAllLocked)} <span className="text-xs">USDT</span></div>
                    <p className="mt-1 text-[11px] text-amber-100/50">تظل محسوبة ضمن الإجمالي لحين التسوية</p>
                  </div>
                </section>

                <section className="mb-6 rounded-2xl border border-white/10 bg-[#08111e] p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-black">رصيد الإيداع</h2>
                      <p className="mt-1 text-xs text-slate-400">رصيد الإيداع منفصل، ولا يُسحب مباشرة من صفحة السحب.</p>
                    </div>
                    <div className="text-left">
                      <div className="text-[11px] text-slate-500">المتاح للإيداع/التفعيل</div>
                      <div className="text-lg font-black text-slate-100">{money(totalDepositAvailable)} USDT</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck size={15} className="text-emerald-300" />
                    رصيد الإيداع لا يُضاف مرة أخرى إلى إجمالي رصيد السحب.
                  </div>
                </section>

                <section className="mb-6 rounded-2xl border border-cyan-300/15 bg-[#08111e] p-4 md:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">السحب العام</h2>
                      <p className="mt-1 text-xs text-slate-400">اسحب من أرباح ومبالغ المحفظة العامة المتاحة.</p>
                    </div>
                    <div className="text-left">
                      <div className="text-[11px] text-slate-500">الرصيد المتاح</div>
                      <div className="text-xl font-black text-cyan-200">{money(totalGeneralAvailable)} USDT</div>
                    </div>
                  </div>
                  {renderWithdrawalForm("wallet")}
                </section>

                <section className="mb-6">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">السحب من الباقات</h2>
                      <p className="mt-1 text-xs text-slate-400">كل باقة تظهر مرة واحدة مع حساب التفعيل النشط فقط.</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-bold text-slate-300">{packageCards.length} باقة</span>
                  </div>
                  {!packageCards.length ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-[#08111e] p-8 text-center text-sm text-slate-500">لا توجد باقات أو أرصدة باقات على هذا الحساب.</div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {packageCards.map(({ key, plan, accounts, legacy }) => {
                        const available = Math.max(0, accounts.reduce(
                          (sum, account) => sum +
                            Math.max(0, Number(account.availableEarnings || 0)) -
                            Math.max(0, Number(account.withdrawalBalanceDebt || 0)),
                          0,
                        ));
                        const locked = accounts.reduce((sum, account) => sum + Math.max(0, Number(account.lockedEarnings || 0)), 0);
                        const withdrawable = accounts.reduce((sum, account) => sum + packageMaximum(account), 0);
                        const active = accounts.some((account) => account.status === "active");
                        const activeAccounts = accounts.filter((account) => account.status === "active");
                        return (
                          <article key={key} className="overflow-hidden rounded-2xl border border-white/10 bg-[#08111e]">
                            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 bg-white/[0.025] p-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <PackageOpen size={18} className="text-emerald-300" />
                                  <h3 className="text-base font-black">{plan.name}</h3>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                  <span className={active ? "rounded-full bg-emerald-300/10 px-2.5 py-1 text-emerald-200" : "rounded-full bg-slate-700/50 px-2.5 py-1 text-slate-300"}>
                                    {active ? "لها تفعيل نشط" : accounts.length ? "أرصدة تفعيلات سابقة" : "لم تُفعّل"}
                                  </span>
                                  {legacy && <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-slate-400">باقة سابقة</span>}
                                </div>
                              </div>
                              <div className="text-left">
                                <div className="text-[11px] text-slate-500">المتاح في الباقة</div>
                                <div className="text-xl font-black text-emerald-200">{money(available)} USDT</div>
                                <div className="mt-1 text-[11px] text-slate-400">المسموح للسحب: {money(withdrawable)} USDT</div>
                                <div className="mt-1 text-[11px] text-slate-500">المحجوز: {money(locked)} USDT</div>
                              </div>
                            </header>

                            {!accounts.length ? (
                              <div className="p-4 text-sm text-slate-500">فعّل الباقة أولًا حتى يظهر حساب سحب لها.</div>
                            ) : (
                              <div className="space-y-3 p-3 md:p-4">
                                {activeAccounts.map((account) => renderPackageAccount(account, plan))}

                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="mb-6 rounded-2xl border border-white/10 bg-[#08111e] p-4 md:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <History size={18} className="text-emerald-300" />
                    <div>
                      <h2 className="text-lg font-black">حركة السحب</h2>
                      <p className="mt-1 text-xs text-slate-400">السجل المعروض يأتي من طلبات السحب المسجلة على الحساب.</p>
                    </div>
                    {pendingRequests.length > 0 && (
                      <span className="mr-auto rounded-full bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">
                        {pendingRequests.length} طلب مفتوح
                      </span>
                    )}
                  </div>
                  {!history.length ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">لا توجد طلبات سحب مسجلة.</div>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {[...history].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(renderRequest)}
                    </div>
                  )}
                  {generalHistory.length > 0 && packageHistory.length > 0 && (
                    <div className="mt-4 text-[11px] text-slate-500">
                      السحب العام: {generalHistory.length} طلب · سحب الباقات: {packageHistory.length} طلب
                    </div>
                  )}
                </section>
                <p className="text-center text-[11px] leading-6 text-slate-600">
                  رصيد الإيداع منفصل عن السحب. السحب من الباقة يخصم من حساب التفعيل المختار فقط.
                </p>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
