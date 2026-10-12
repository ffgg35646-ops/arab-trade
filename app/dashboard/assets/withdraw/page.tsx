"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { ArrowDownToLine, Clock3, RefreshCw, ShieldCheck, Wallet } from "lucide-react";

type Method = {
  _id: string;
  name: string;
  asset: string;
  network: string;
  minWithdrawal: number;
  enabled: boolean;
  withdrawalEnabled?: boolean;
  maxWithdrawal?: number;
  withdrawalFee?: number;
  warning?: string;
};

type Balance = {
  asset: string;
  available: number;
  locked: number;
};

type SavedAddress = {
  _id: string;
  asset: string;
  network: string;
  address: string;
};

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


const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });

const statusLabel = (status: string) => {
  if (status === "completed") return "مكتمل";
  if (status === "approved") return "تمت الموافقة";
  if (status === "processing") return "قيد التنفيذ";
  if (status === "rejected") return "مرفوض";
  if (status === "failed") return "فشل التنفيذ";
  return "قيد المراجعة";
};

const statusClass = (status: string) => {
  if (status === "completed") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (status === "rejected" || status === "failed") return "border-red-400/20 bg-red-400/10 text-red-200";
  if (status === "approved" || status === "processing") return "border-blue-400/20 bg-blue-400/10 text-blue-200";
  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
};

export default function WithdrawPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [depositBalances, setDepositBalances] = useState<Balance[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [packageAccounts, setPackageAccounts] = useState<PackageAccount[]>([]);
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedSource, setSelectedSource] = useState<"wallet" | "package">("package");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
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
          if (!response.ok || !data.success) {
            throw new Error(data.message || "تعذر تحميل بيانات السحب");
          }
          return data;
        })
      );

      const methodRows: Method[] = Array.isArray(methodsData.methods)
        ? methodsData.methods.filter((item: Method) => item.enabled !== false && item.withdrawalEnabled !== false)
        : [];
      const packageRows: PackageAccount[] = Array.isArray(packageData.userPackages)
        ? packageData.userPackages.filter((item: PackageAccount) =>
            ["active", "cancelled"].includes(item.status) && String(item.asset || "").toUpperCase() === "USDT"
          )
        : [];

      const loadedAddresses: SavedAddress[] = Array.isArray(addressesData.addresses) ? addressesData.addresses : [];
      setMethods(methodRows);
      setDepositBalances(Array.isArray(walletData.depositBalances) ? walletData.depositBalances : []);
      setBalances(Array.isArray(walletData.generalWithdrawalBalances) ? walletData.generalWithdrawalBalances : (walletData.spot?.balances || walletData.wallet?.balances || []));
      setHistory(Array.isArray(historyData.withdrawals) ? historyData.withdrawals : []);
      setSavedAddresses(loadedAddresses);
      setPackageAccounts(packageRows);
      setSelectedPackageId((current) =>
        current && packageRows.some((item) => item._id === current)
          ? current
          : packageRows.find((item) => Number(item.withdrawalLimit || 0) > 0)?._id || packageRows[0]?._id || ""
      );
      setSelectedMethodId((current) =>
        current && methodRows.some((item) => item._id === current && (selectedSource !== "package" || item.asset === "USDT"))
          ? current
          : (methodRows.find((item) => selectedSource !== "package" || item.asset === "USDT")?._id || "")
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء تحميل بيانات السحب");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSource]);

  useEffect(() => {
    void Promise.resolve().then(() => { void load(); });
  }, [load]);

  const selectedMethod = useMemo(
    () => methods.find((item) => item._id === selectedMethodId) || null,
    [methods, selectedMethodId]
  );
  const selectedPackage = packageAccounts.find((item) => item._id === selectedPackageId) || null;
  const selectedGeneralBalance = selectedMethod
    ? Number(balances.find((item) => item.asset === selectedMethod.asset)?.available || 0)
    : 0;
  const selectedBalance = selectedSource === "package"
    ? Number(selectedPackage?.availableEarnings || 0)
    : selectedGeneralBalance;
  const isFirstWithdrawal = !!selectedPackage &&
    selectedPackage.status === "active" &&
    selectedPackage.firstWithdrawalStatus !== "pending" &&
    selectedPackage.firstWithdrawalStatus !== "completed" &&
    Number(selectedPackage.totalWithdrawn || 0) <= 0;
  const firstStatusPending = selectedPackage?.firstWithdrawalStatus === "pending" && selectedSource === "package";
  const selectedPackageMax = selectedPackage
    ? Math.max(0, Math.min(
        Number(selectedPackage.availableEarnings || 0),
        Number(selectedPackage.withdrawalLimit ?? (
          isFirstWithdrawal
            ? Number(selectedPackage.investedAmount || 0) * Number(selectedPackage.firstPackageWithdrawalPercent ?? 100) / 100
            : Number(selectedPackage.referralRemaining || 0)
        ))
      ))
    : 0;
  const savedAddress = selectedMethod
    ? savedAddresses.find((item) => item.asset === selectedMethod.asset && item.network === selectedMethod.network)
    : undefined;
  const totalGeneralAvailable = balances.reduce((sum, item) => sum + (item.asset === "USDT" ? Number(item.available || 0) : 0), 0);
  const totalPackageAvailable = packageAccounts.reduce((sum, item) => sum + Number(item.availableEarnings || 0), 0);
  const totalPackageLocked = packageAccounts.reduce((sum, item) => sum + Number(item.lockedEarnings || 0), 0);
  const totalDepositAvailable = depositBalances.reduce((sum, item) => sum + (item.asset === "USDT" ? Number(item.available || 0) : 0), 0);
  const openWithdrawals = history.filter((item) => ["pending", "approved", "processing"].includes(item.status)).length;
  const packageHistory = history.filter((item) => item.source === "package");
  const generalHistory = history.filter((item) => item.source !== "package");

  function changeMethod(id: string) {
    setSelectedMethodId(id);
    setAmount("");
    setError("");
    setMessage("");
    const method = methods.find((item) => item._id === id);
    const addressRow = method && savedAddresses.find((item) => item.asset === method.asset && item.network === method.network);
    setAddress(addressRow?.address || "");
  }

  function changeSource(source: "wallet" | "package") {
    setSelectedSource(source);
    setAmount("");
    setError("");
    setMessage("");
    const method = methods.find((item) => source !== "package" || item.asset === "USDT");
    if (method) {
      setSelectedMethodId(method._id);
      const knownAddress = savedAddresses.find((item) => item.asset === method.asset && item.network === method.network);
      setAddress(knownAddress?.address || "");
    }
  }

  async function saveAddress() {
    if (!selectedMethod) {
      setError("اختر وسيلة السحب أولًا");
      return;
    }
    const cleanAddress = address.trim();
    if (!cleanAddress) {
      setError("أدخل عنوان محفظة السحب");
      return;
    }
    setSavingAddress(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/withdrawal-addresses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: selectedMethod.asset,
          network: selectedMethod.network,
          address: cleanAddress,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر حفظ عنوان السحب");
      setMessage("تم حفظ عنوان السحب بنجاح.");
      await load();
      setAddress(cleanAddress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ العنوان");
    } finally {
      setSavingAddress(false);
    }
  }

  async function submitWithdrawal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!selectedMethod) {
      setError("اختر وسيلة السحب");
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("أدخل مبلغ سحب صحيحًا");
      return;
    }
    if (!address.trim()) {
      setError("أدخل عنوان محفظة السحب");
      return;
    }
    if (selectedSource === "package") {
      if (!selectedPackage) {
        setError("اختر الباقة التي تريد السحب من رصيدها");
        return;
      }
      if (firstStatusPending) {
        setError("أول طلب سحب من هذه الباقة ما زال قيد المراجعة.");
        return;
      }
      if (numericAmount > selectedPackageMax) {
        setError(selectedPackageMax > 0
          ? "المتاح للسحب الآن من باقة " + selectedPackage.packageName + " هو " + money(selectedPackageMax) + " USDT فقط."
          : isFirstWithdrawal
            ? "لا يوجد رصيد محقق متاح لأول سحب من هذه الباقة."
            : "لا يوجد حد سحب إضافي متاح حاليًا من هذه الباقة وفق قواعد الإحالات.");
        return;
      }
    } else if (numericAmount > selectedGeneralBalance) {
      setError("رصيد السحب العام غير كافٍ. المتاح هو " + money(selectedGeneralBalance) + " " + selectedMethod.asset + ".");
      return;
    }

    if (numericAmount < Number(selectedMethod.minWithdrawal || 0)) {
      setError("الحد الأدنى للسحب هو " + money(Number(selectedMethod.minWithdrawal || 0)) + " " + selectedMethod.asset);
      return;
    }
    if (selectedMethod.maxWithdrawal && selectedMethod.maxWithdrawal > 0 && numericAmount > selectedMethod.maxWithdrawal) {
      setError("الحد الأقصى للسحب هو " + money(selectedMethod.maxWithdrawal) + " " + selectedMethod.asset);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: selectedMethod.asset,
          network: selectedMethod.network,
          address: address.trim(),
          amount: numericAmount,
          source: selectedSource,
          userPackageId: selectedSource === "package" ? selectedPackageId : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر إرسال طلب السحب");
      setMessage(data.message || "تم إرسال طلب السحب بنجاح، وهو الآن قيد المراجعة.");
      setAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال طلب السحب");
    } finally {
      setSubmitting(false);
    }
  }

  const requestCard = (item: Withdrawal) => (
    <article key={item._id} className="rounded-2xl border border-white/10 bg-[#050a13] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black">{money(item.amount)} {item.asset}</div>
          <div className="mt-1 text-xs text-slate-500">{item.network} · {item.source === "package" ? "سحب من باقة" : "سحب عام"}</div>
          {item.source === "package" && (
            <div className="mt-1 text-xs text-emerald-200">
              {typeof item.userPackageId === "object" && item.userPackageId?.packageName
                ? item.userPackageId.packageName
                : (packageAccounts.find((entry) => entry._id === String(item.userPackageId || ""))?.packageName || "حساب باقة")}
            </div>
          )}
        </div>
        <span className={"rounded-full border px-3 py-1 text-xs font-bold " + statusClass(item.status)}>{statusLabel(item.status)}</span>
      </div>
      <div className="mt-3 break-all text-xs text-slate-500">{item.address}</div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>{item.createdAt ? new Date(item.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : ""}</span>
        {item.fee !== undefined && <span>الرسوم: {money(Number(item.fee || 0))} · الصافي: {money(Number(item.receiveAmount ?? (item.amount - Number(item.fee || 0))))} {item.asset}</span>}
      </div>
      {item.adminNote && <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] p-3 text-xs text-slate-400">ملاحظة الإدارة: {item.adminNote}</div>}
    </article>
  );

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
                <div>
                  <h1 className="text-3xl font-black">السحب</h1>
                  <p className="mt-1 text-sm text-slate-400">اسحب من رصيدك العام أو من رصيد أي باقة على حدة.</p>
                </div>
              </div>
              <button type="button" onClick={() => { setRefreshing(true); void load(); }} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-300 disabled:opacity-50">
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> تحديث الأرصدة
              </button>
            </div>

            <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-[#18202b] to-[#07101d] p-4">
                <div className="text-xs text-amber-100/80">رصيد الإيداع الخارجي</div>
                <div className="mt-3 text-2xl font-black text-amber-200">{money(totalDepositAvailable)} <span className="text-xs">USDT</span></div>
                <p className="mt-1 text-xs leading-5 text-slate-500">للتفعيل فقط، وليس للسحب المباشر.</p>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#0d2534] to-[#07101d] p-4">
                <div className="text-xs text-cyan-100/80">رصيد السحب العام</div>
                <div className="mt-3 text-2xl font-black text-cyan-200">{money(totalGeneralAvailable)} <span className="text-xs">USDT</span></div>
                <p className="mt-1 text-xs leading-5 text-slate-500">رصيد منفصل عن أرباح الباقات.</p>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#0e2b26] to-[#07101d] p-4">
                <div className="text-xs text-emerald-100/80">أرباح الباقات المتاحة</div>
                <div className="mt-3 text-2xl font-black text-emerald-200">{money(totalPackageAvailable)} <span className="text-xs">USDT</span></div>
                <p className="mt-1 text-xs leading-5 text-slate-500">كل باقة لها رصيد وحد سحب مستقل.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0d2030] to-[#07101d] p-4">
                <div className="text-xs text-slate-400">طلبات مفتوحة · مبالغ الباقات المحجوزة</div>
                <div className="mt-3 text-2xl font-black text-amber-200">{openWithdrawals} <span className="text-xs">طلبات</span></div>
                <p className="mt-1 text-xs leading-5 text-slate-500">رصيد الباقات قيد المراجعة: {money(totalPackageLocked)} USDT</p>
              </div>
            </section>

            {error && <div role="alert" className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">{error}</div>}
            {message && <div role="status" className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200">{message}</div>}

            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-12 text-center text-slate-400">جاري تحميل الأرصدة وبيانات السحب...</div>
            ) : (
              <>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <section className="rounded-3xl border border-white/10 bg-[#07101d] p-5 md:p-7">
                    <div className="mb-6">
                      <h2 className="text-xl font-black">إنشاء طلب سحب</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-400">اختَر مصدر الرصيد، وبعدها حدد الباقة المطلوبة أو استخدم الرصيد العام.</p>
                    </div>

                    <div className="mb-6 grid gap-3 sm:grid-cols-2">
                      <button type="button" onClick={() => changeSource("package")} className={selectedSource === "package" ? "rounded-2xl border border-emerald-300/40 bg-emerald-300/[0.08] p-4 text-right" : "rounded-2xl border border-white/10 bg-[#050a13] p-4 text-right hover:border-white/20"}>
                        <div className="flex items-center justify-between gap-2"><span className="font-black">السحب من الباقات</span><Wallet size={18} className="text-emerald-300" /></div>
                        <div className="mt-3 text-2xl font-black text-emerald-200">{money(totalPackageAvailable)} <span className="text-xs">USDT</span></div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">اختيار إحدى الباقات وحساب حدها بشكل مستقل.</p>
                      </button>
                      <button type="button" onClick={() => changeSource("wallet")} className={selectedSource === "wallet" ? "rounded-2xl border border-cyan-300/40 bg-cyan-300/[0.08] p-4 text-right" : "rounded-2xl border border-white/10 bg-[#050a13] p-4 text-right hover:border-white/20"}>
                        <div className="flex items-center justify-between gap-2"><span className="font-black">السحب العام</span><Wallet size={18} className="text-cyan-300" /></div>
                        <div className="mt-3 text-2xl font-black text-cyan-200">{money(totalGeneralAvailable)} <span className="text-xs">USDT</span></div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">يُخصم من المحفظة العامة فقط.</p>
                      </button>
                    </div>

                    {selectedSource === "package" && (
                      <div className="mb-6">
                        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                          <div><h3 className="font-black">اختر الباقة</h3><p className="mt-1 text-xs leading-5 text-slate-500">كل بطاقة تعرض رصيدها وحد السحب المتاح لها.</p></div>
                          <span className="text-xs text-slate-500">{packageAccounts.length} حساب باقة</span>
                        </div>
                        {packageAccounts.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">لا توجد حسابات باقات متاحة للسحب.</div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            {packageAccounts.map((item) => {
                              const chosen = item._id === selectedPackageId;
                              const firstStatus = item.status === "cancelled" ? "باقة غير نشطة: السحب يشترط حد إحالات نشطة متبقيًا" : item.firstWithdrawalStatus === "pending" ? "أول طلب سحب قيد المراجعة" : (item.firstWithdrawalStatus === "completed" || Number(item.totalWithdrawn || 0) > 0) ? "تم حسم أول سحب" : "أول سحب متاح حسب النسبة المحددة";
                              return (
                                <button key={item._id} type="button" aria-pressed={chosen} onClick={() => { setSelectedPackageId(item._id); setAmount(""); setError(""); setMessage(""); }} className={chosen ? "rounded-2xl border border-emerald-300/50 bg-emerald-300/[0.07] p-4 text-right transition" : "rounded-2xl border border-white/10 bg-[#050a13] p-4 text-right transition hover:border-white/20"}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div><div className="font-black">{item.packageName}</div><div className="mt-1 text-[11px] text-slate-500">{item.status === "active" ? "الباقة النشطة" : "باقة سابقة"}</div></div>
                                    <span className={chosen ? "rounded-full bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-200" : "rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-400"}>{chosen ? "محددة" : "اختيار"}</span>
                                  </div>
                                  <div className="mt-4 text-xl font-black text-emerald-200">{money(Number(item.availableEarnings || 0))} <span className="text-[11px]">USDT متاح</span></div>
                                  <div className="mt-2 text-sm font-bold text-cyan-200">حد السحب الحالي: {money(Number(item.withdrawalLimit || 0))} USDT</div>
                                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-2"><div className="text-slate-500">قيد المراجعة</div><div className="mt-1 font-bold">{money(Number(item.lockedEarnings || 0))} USDT</div></div>
                                    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-2"><div className="text-slate-500">تم سحبه سابقًا</div><div className="mt-1 font-bold">{money(Number(item.totalWithdrawn || 0))} USDT</div></div>
                                  </div>
                                  <div className="mt-3 text-[11px] leading-5 text-slate-500">{firstStatus}</div>
                                  {!isFirstWithdrawal && item.firstWithdrawalStatus !== "pending" && <div className="mt-1 text-[11px] leading-5 text-slate-500">الإحالات: {Number(item.activeReferralCount || 0)} · حد الإحالات: {money(Number(item.referralWithdrawalCap || 0))} USDT · المستخدم من الحد: {money(Number(item.referralAlreadyWithdrawn || 0))} USDT</div>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {selectedPackage && (
                          <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4 text-xs leading-6 text-cyan-100/80">
                            {firstStatusPending
                              ? "أول طلب سحب من هذه الباقة قيد المراجعة. لا يمكن تقديم طلب آخر حتى تتم معالجته."
                              : isFirstWithdrawal
                                ? "حد أول سحب: " + money(Number(selectedPackage.investedAmount || 0) * Number(selectedPackage.firstPackageWithdrawalPercent ?? 100) / 100) + " USDT، مع الالتزام بالرصيد المحقق المتاح."
                                : selectedPackage.status === "cancelled"
                                  ? "هذه الباقة غير نشطة للسحب الآن. يلزم وجود إحالات نشطة لديها إيداعات معتمدة وحد سحب متبقٍ؛ تُخصم السحوبات السابقة من هذا الحد."
                                  : "السحوبات التالية تعتمد على " + Number(selectedPackage.referralPackageWithdrawalPercent ?? 50) + "% من إيداعات الإحالات المعتمدة بعد خصم السحوبات السابقة."}
                          </div>
                        )}
                      </div>
                    )}

                    <form onSubmit={submitWithdrawal} className="space-y-5">
                      <div>
                        <label className="mb-2 block text-sm font-bold">وسيلة السحب</label>
                        <select value={selectedMethodId} onChange={(event) => changeMethod(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/50">
                          <option value="">اختر العملة والشبكة</option>
                          {methods.filter((item) => selectedSource !== "package" || item.asset === "USDT").map((item) => <option key={item._id} value={item._id}>{item.name} — {item.asset} / {item.network}</option>)}
                        </select>
                      </div>

                      {selectedMethod && (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                              <div className="text-xs text-slate-500">الرصيد المتاح من المصدر المختار</div>
                              <div className="mt-2 text-xl font-black">{money(selectedBalance)} <span className="text-xs text-cyan-200">{selectedMethod.asset}</span></div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                              <div className="text-xs text-slate-500">الحد الأدنى للسحب</div>
                              <div className="mt-2 text-xl font-black">{money(Number(selectedMethod.minWithdrawal || 0))} <span className="text-xs text-cyan-200">{selectedMethod.asset}</span></div>
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <label className="block text-sm font-bold">{selectedSource === "package" ? "عنوان استلام سحب أرباح الباقة" : "عنوان استلام السحب العام"}</label>
                              <span className="text-xs text-slate-500">{savedAddress ? "يوجد عنوان محفوظ لهذه الشبكة" : "لا يوجد عنوان محفوظ لهذه الشبكة"}</span>
                            </div>
                            <p className="mb-2 text-xs leading-5 text-slate-500">اكتب عنوان محفظتك أنت لاستلام المبلغ. عنوان الإيداع الذي يحدده الأدمن مخصص لاستقبال الإيداعات ولا تستخدمه كعنوان استلام للسحب.</p>
                            <textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={3} required placeholder="أدخل عنوان محفظتك لاستلام السحب" className="w-full resize-y rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/50" />
                            <button type="button" onClick={() => void saveAddress()} disabled={savingAddress || !address.trim()} className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-2 text-sm font-bold text-cyan-200 disabled:opacity-40">{savingAddress ? "جاري حفظ العنوان..." : savedAddress ? "تحديث العنوان المحفوظ" : "حفظ العنوان للمرة القادمة"}</button>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-bold">{selectedSource === "package" ? "مبلغ السحب من الباقة المحددة" : "مبلغ السحب العام"}</label>
                            <input type="number" min={Number(selectedMethod.minWithdrawal || 0)} max={selectedSource === "package" ? selectedPackageMax : (selectedMethod.maxWithdrawal && selectedMethod.maxWithdrawal > 0 ? selectedMethod.maxWithdrawal : undefined)} step="any" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={firstStatusPending} required placeholder="اكتب المبلغ" className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/50 disabled:opacity-50" />
                            {selectedSource === "package" && <p className="mt-2 text-xs text-slate-500">أقصى مبلغ يمكنك طلبه الآن من هذه الباقة: {money(selectedPackageMax)} USDT.</p>}
                          </div>

                          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm">
                            <div className="flex justify-between py-1"><span className="text-slate-500">رسوم السحب</span><span>{money(Number(selectedMethod.withdrawalFee || 0))} {selectedMethod.asset}</span></div>
                            <div className="flex justify-between py-1"><span className="text-slate-500">المبلغ المتوقع استلامه</span><span className="font-black text-emerald-200">{money(Math.max(0, Number(amount || 0) - Number(selectedMethod.withdrawalFee || 0)))} {selectedMethod.asset}</span></div>
                          </div>

                          {selectedMethod.warning && <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm leading-6 text-amber-200">{selectedMethod.warning}</div>}
                        </>
                      )}

                      <button type="submit" disabled={submitting || !selectedMethod || (selectedSource === "package" && (!selectedPackage || firstStatusPending || selectedPackageMax <= 0))} className="w-full rounded-xl bg-cyan-300 px-5 py-4 font-black text-[#03111c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">
                        {submitting ? "جاري إرسال طلب السحب..." : selectedSource === "package" ? "إرسال طلب سحب من الباقة المحددة" : "إرسال طلب سحب عام"}
                      </button>
                    </form>
                  </section>

                  <aside className="rounded-3xl border border-cyan-400/20 bg-[#07131f]/80 p-6">
                    <div className="mb-5 flex items-center gap-3"><ShieldCheck className="text-cyan-300" size={23} /><h2 className="text-xl font-black">معلومات السحب</h2></div>
                    <div className="space-y-4 text-sm leading-6 text-slate-400">
                      <p>• رصيد الإيداع الخارجي يُستخدم لتفعيل الباقات فقط ولا يمكن سحبه مباشرة.</p>
                      <p>• السحب العام يُخصم من رصيد المحفظة العام فقط.</p>
                      <p>• سحب الباقات يُخصم من حساب الباقة المحدد، ولا يغيّر أرصدة الباقات الأخرى.</p>
                      <p>• أول سحب من كل باقة يخضع للنسبة المحددة من الإدارة.</p>
                      <p>• السحب اللاحق يخضع لحد الإحالات المعتمدة بعد خصم الطلبات السابقة.</p>
                      <p>• جميع الطلبات تخضع للمراجعة؛ المبلغ المحجوز لا يكون متاحًا لطلب آخر.</p>
                      <p>• تأكد من صحة العنوان والشبكة قبل إرسال الطلب.</p>
                    </div>
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 size={15} />الطلبات قيد المراجعة</div>
                      <div className="mt-2 text-2xl font-black text-amber-200">{openWithdrawals}</div>
                    </div>
                  </aside>
                </div>

                <section className="mt-8 rounded-3xl border border-purple-400/20 bg-[#07131f]/80 p-5 md:p-7">
                  <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">طلبات السحب العام</h2><p className="mt-1 text-xs text-slate-500">سجل مستقل لطلبات السحب من المحفظة العامة.</p></div><span className="rounded-full border border-purple-300/20 px-3 py-1 text-xs text-purple-200">{generalHistory.length} طلب</span></div>
                  {generalHistory.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">لا توجد طلبات سحب عام حتى الآن.</div> : <div className="grid gap-3 lg:grid-cols-2">{generalHistory.map(requestCard)}</div>}
                </section>

                <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-[#07131f]/80 p-5 md:p-7">
                  <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">طلبات سحب الباقات</h2><p className="mt-1 text-xs text-slate-500">كل طلب مرتبط بحساب الباقة الذي خُصم منه المبلغ.</p></div><span className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs text-cyan-200">{packageHistory.length} طلب</span></div>
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
