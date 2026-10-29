"use client";

import { useCallback, useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { AlertCircle, CheckCircle2, Layers3, RefreshCw, Wallet } from "lucide-react";

type Account = {
  _id: string;
  sourceAccountIds: string[];
  status: string;
  balance: number;
  activationAmount: number;
  allowance: number;
  baseAllowance: number;
  dailyAllowance: number;
  activeReferralCount: number;
  referralDepositTotal: number;
  referralUnlockPercent: number;
  referralUsed: number;
  referralAllowance: number;
  available: number;
  hasAccount: boolean;
};
type Plan = {
  _id: string;
  name: string;
  price: number;
  minimum: number;
  enabled: boolean;
  account: Account | null;
};
type Network = { code: string; name: string };
type Request = {
  _id: string;
  type: string;
  generalSource?: "wallet" | "deposit";
  packageId?: string | null;
  amount: number;
  grossAmount?: number;
  feePercent?: number;
  feeAmount?: number;
  payoutAmount?: number;
  asset?: string;
  network?: string;
  payoutAddress?: string;
  status: string;
  createdAt?: string;
  reviewedAt?: string | null;
};
type Data = {
  summary: {
    totalBalance: number;
    generalAvailable: number;
    packageAvailable: number;
  };
  general: { available: number; depositAvailable: number; minimum: number; configured: boolean; feePercent?: number };
  networks: Network[];
  packages: Plan[];
  requests: Request[];
};

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 8 });

function isValidPayoutAddress(network: string, address: string) {
  if (network === "TRC20") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  if (network === "BEP20") return /^0x[a-fA-F0-9]{40}$/.test(address);
  return false;
}

export default function WithdrawalsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [packageNetworks, setPackageNetworks] = useState<Record<string, string>>({});
  const [packageMessages, setPackageMessages] = useState<Record<string, string>>({});
  const [selectedSource, setSelectedSource] = useState("general");
  const [generalSource, setGeneralSource] = useState<"wallet" | "deposit">("wallet");
  const [generalAmount, setGeneralAmount] = useState("");
  const [generalAddress, setGeneralAddress] = useState("");
  const [generalNetwork, setGeneralNetwork] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [requestsPage, setRequestsPage] = useState(1);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error" | "info">("info");

  function showMessage(text: string, kind: "success" | "error" | "info" = "error") {
    setMessage(text);
    setMessageKind(kind);
  }

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/withdrawals", { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        showMessage(json.message || "تعذر تحميل بيانات السحب", "error");
        return;
      }
      setData(json as Data);
      setGeneralNetwork((current) => {
        if (current && json.networks?.some((network: Network) => network.code === current)) return current;
        return json.networks?.[0]?.code || "";
      });
    } catch {
      showMessage("تعذر تحميل بيانات السحب", "error");
    } finally {
      setInitialLoadComplete(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "deposit") {
      setSelectedSource("general");
      setGeneralSource("deposit");
    }
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, [load]);

  const hasPending = Boolean(data?.requests.some((item) => item.status === "pending"));
  const firstNetwork = data?.networks[0]?.code || "";
  const selectedGeneralNetwork = generalNetwork || firstNetwork;
  const selectedGeneralAvailable = generalSource === "deposit"
    ? Number(data?.general.depositAvailable || 0)
    : Number(data?.general.available || 0);
  const requestsPerPage = 4;
  const requestCount = data?.requests.length || 0;
  const requestPageCount = Math.ceil(requestCount / requestsPerPage);
  const currentRequestsPage = Math.min(requestsPage, Math.max(requestPageCount, 1));
  const visibleRequests = (data?.requests || []).slice(
    (currentRequestsPage - 1) * requestsPerPage,
    currentRequestsPage * requestsPerPage,
  );

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setMessageKind("info");
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        showMessage(result.message || "تعذر إنشاء طلب السحب", "error");
      } else {
        showMessage(result.message || "تم إرسال طلب السحب بنجاح", "success");
      }
      await load();
    } catch {
      showMessage("تعذر الاتصال بخدمة السحب", "error");
    } finally {
      setBusy(false);
    }
  }

  function submitGeneral() {
    const amount = Number(generalAmount);
    if (!generalAddress.trim()) {
      showMessage("اكتب عنوان الدفع");
      return;
    }
    if (!selectedGeneralNetwork) {
      showMessage("اختر شبكة السحب");
      return;
    }
    if (!data?.general.configured) {
      showMessage("الأدمن لم يحدد الحد الأدنى للسحب العام بعد");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage("اكتب مبلغ سحب صحيحًا");
      return;
    }
    if (amount < data.general.minimum) {
      showMessage("الحد الأدنى للسحب العام هو " + money(data.general.minimum) + " USDT");
      return;
    }
    if (amount > selectedGeneralAvailable) {
      showMessage(generalSource === "deposit"
        ? "رصيد الإيداع الخارجي المتاح للسحب هو " + money(selectedGeneralAvailable) + " USDT فقط"
        : "الرصيد العام المتاح للسحب هو " + money(selectedGeneralAvailable) + " USDT فقط");
      return;
    }
    if (!isValidPayoutAddress(selectedGeneralNetwork, generalAddress.trim())) {
      showMessage(selectedGeneralNetwork === "TRC20"
        ? "عنوان TRC20 يجب أن يكون عنوان TRON بطول 34 حرفًا يبدأ بـ T."
        : "عنوان BEP20 يجب أن يبدأ بـ 0x ويتبعه 40 رقمًا سداسيًا.");
      return;
    }
    void submit({
      type: "general",
      generalSource,
      amount,
      asset: "USDT",
      network: selectedGeneralNetwork,
      payoutAddress: generalAddress.trim(),
    });
  }

  function handlePackageButtonClick(plan: Plan, needsActiveReferrals: boolean) {
    if (needsActiveReferrals) {
      setPackageMessages((current) => ({ ...current, [plan._id]: "لا توجد إحالات نشطة" }));
      return;
    }
    setPackageMessages((current) => ({ ...current, [plan._id]: "" }));
    submitPackage(plan);
  }

  function submitPackage(plan: Plan) {
    const account = plan.account;
    const address = (addresses[plan._id] || "").trim();
    const amount = Number(amounts[plan._id]);
    const network = packageNetworks[plan._id] || firstNetwork;

    if (!account?.hasAccount) {
      showMessage("لا يوجد حساب سحب لهذه الباقة قبل تفعيلها");
      return;
    }
    if (!address) {
      showMessage("اكتب عنوان الدفع لهذه الباقة");
      return;
    }
    if (!network) {
      showMessage("اختر شبكة السحب");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount < plan.minimum) {
      showMessage("الحد الأدنى للسحب هو " + plan.minimum + " USDT");
      return;
    }
    if (amount > Number(account.available || 0)) {
      showMessage("المتاح للسحب من هذه الباقة هو " + money(Number(account.available || 0)) + " USDT فقط");
      return;
    }
    if (Math.round(amount * 1e8) / 1e8 !== amount) {
      showMessage("مبلغ السحب يجب ألا يتجاوز 8 منازل عشرية");
      return;
    }
    if (!isValidPayoutAddress(network, address)) {
      showMessage(network === "TRC20"
        ? "عنوان TRC20 يجب أن يكون عنوان TRON بطول 34 حرفًا يبدأ بـ T."
        : "عنوان BEP20 يجب أن يبدأ بـ 0x ويتبعه 40 رقمًا سداسيًا.");
      return;
    }
    void submit({
      type: "package",
      packageId: plan._id,
      amount,
      asset: "USDT",
      network,
      payoutAddress: address,
    });
  }

  const visiblePackages = data?.packages || [];
  const selectedPackage = visiblePackages.find((plan) => plan._id === selectedSource);
  const validSelectedSource = selectedSource === "general" || selectedPackage ? selectedSource : "general";

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-h-screen w-full min-w-0 flex-1 bg-[#050a13] p-3 text-white sm:p-6">
          <div className="mx-auto w-full max-w-3xl space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black">السحب</h1>
              <p role="status" className="mt-1 text-xs text-slate-500">{refreshing ? "يتم تحديث البيانات في الخلفية…" : "بيانات الطلبات والأرصدة تتحدث تلقائيًا."}</p>
            </div>
            <button type="button" onClick={() => void load()} disabled={refreshing || busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              تحديث
            </button>
          </header>

          {message && (
            <div role={messageKind === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
              messageKind === "success"
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
                : messageKind === "error"
                  ? "border-red-500/20 bg-red-500/5 text-red-200"
                  : "border-amber-400/20 bg-amber-400/[0.04] text-amber-100"
            }`}>
              {messageKind === "error"
                ? <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-300" />
                : <CheckCircle2 size={18} className={`mt-0.5 shrink-0 ${messageKind === "success" ? "text-emerald-300" : "text-amber-200"}`} />}
              <span>{message}</span>
            </div>
          )}
          {hasPending && (
            <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 text-sm text-amber-100">
              لديك طلب سحب قيد المراجعة. لن يمكن إرسال طلب آخر حتى يراجع الأدمن الطلب الحالي.
            </div>
          )}

          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 shadow-lg shadow-black/10 backdrop-blur-xl md:p-5">
            <label className="block space-y-2 text-sm font-bold text-slate-200">
              <span className="inline-flex w-fit items-center rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-cyan-100 shadow-lg shadow-cyan-950/20 backdrop-blur-md">حدد الباقة</span>
              <select
                aria-label="مصدر السحب"
                value={validSelectedSource}
                onChange={(event) => {
                  setSelectedSource(event.target.value);
                  setMessage("");
                }}
                disabled={!data || busy}
                className="w-full rounded-xl border border-slate-600 bg-[#050a13] p-3 text-white outline-none focus:border-cyan-400 disabled:opacity-50"
              >
                <option value="general">السحب العام</option>
                {visiblePackages.map((plan) => (
                  <option key={plan._id} value={plan._id}>{plan.name}</option>
                ))}
              </select>
            </label>
            {!data && <p role="status" className="text-xs text-slate-400">{initialLoadComplete ? "تعذر عرض بيانات السحب حاليًا. يمكنك إعادة المحاولة من زر تحديث." : "يتم جلب بيانات السحب في الخلفية؛ النموذج جاهز للعرض بمجرد وصول البيانات."}</p>}
          </section>

          {data && (
          <section className="space-y-5 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
            {data && validSelectedSource !== "general" && (
            <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Layers3 size={20} className="text-cyan-300" />
              <h2 className="text-xl font-black">السحب من الباقات</h2>
            </div>
            <p className="text-sm text-slate-400">ملاحظة: إذا كان الرصيد المتاح 0، يُرجى جلب إحالات نشطة للتمكن من السحب.</p>

            {!data && <p className="text-sm text-slate-400">جاري تحميل الباقات…</p>}
            {data && visiblePackages.length === 0 && <p className="rounded-xl border border-slate-700 p-4 text-slate-400">لا توجد باقات لديك أرصدة سحب منها حاليًا.</p>}

            <div className="grid gap-4">
              {visiblePackages.filter((plan) => plan._id === validSelectedSource).map((plan) => {
                const account = plan.account;
                const network = packageNetworks[plan._id] || firstNetwork;
                const canWithdraw = Boolean(account?.hasAccount && account.available > 0);
                const needsActiveReferrals = Boolean(
                  account?.hasAccount &&
                  account.balance >= plan.minimum &&
                  account.baseAllowance <= 0 &&
                  account.referralAllowance <= 0
                );
                return (
                  <article key={plan._id} className="flex flex-col gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black">{plan.name}</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-600 bg-[#050a13] p-4">
                        <p className="text-sm font-bold text-slate-300">رصيد الباقة</p>
                        <p className="mt-2 text-xl font-black text-white">{money(account?.balance || 0)} USDT</p>
                      </div>
                      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
                        <p className="text-sm font-bold text-slate-300">الرصيد المتاح للسحب</p>
                        <p className="mt-2 text-xl font-black text-emerald-300">{money(account?.available || 0)} USDT</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block min-w-0 space-y-2 text-sm text-slate-300">
                        <span>مبلغ السحب (USDT) — الحد الأدنى {money(plan.minimum)} USDT</span>
                        <input aria-label={"مبلغ السحب من " + plan.name} type="number" min={plan.minimum} max={account?.available} step="0.00000001" disabled={busy || hasPending || !canWithdraw} value={amounts[plan._id] || ""} onChange={(event) => setAmounts((current) => ({ ...current, [plan._id]: event.target.value }))} placeholder={"الحد الأدنى " + money(plan.minimum) + " USDT قبل العمولة"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50" />
                      </label>
                      <label className="block min-w-0 space-y-2 text-sm text-slate-300">
                        <span>عنوان الدفع</span>
                        <input type="text" autoComplete="off" maxLength={200} disabled={busy || hasPending} value={addresses[plan._id] || ""} onChange={(event) => setAddresses((current) => ({ ...current, [plan._id]: event.target.value }))} placeholder={network === "TRC20" ? "عنوان TRON يبدأ بـ T وطوله 34 حرفًا" : "عنوان BEP20 يبدأ بـ 0x وطوله 42 حرفًا"} className="w-full min-w-0 rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50" />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2 text-sm text-slate-300">
                        <span>العملة</span>
                        <select value="USDT" disabled className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:opacity-100">
                          <option value="USDT">USDT</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm text-slate-300">
                        <span>الشبكة</span>
                        <select value={network} onChange={(event) => setPackageNetworks((current) => ({ ...current, [plan._id]: event.target.value }))} disabled={busy || hasPending || !data?.networks.length} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:cursor-not-allowed disabled:opacity-50">
                          {!data?.networks.length && <option value="">لا توجد شبكات</option>}
                          {data?.networks.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
                        </select>
                      </label>
                    </div>

                    <div className="rounded-lg border border-slate-700 bg-[#050a13] p-3 text-xs">
                      <div className="flex justify-between gap-2 text-slate-400"><span>عمولة السحب (5%)</span><span className="text-amber-200">{money(Math.round(Math.max(0, Number(amounts[plan._id]) || 0) * 0.05 * 1e8) / 1e8)} USDT</span></div>
                      <div className="mt-2 flex justify-between gap-2"><span className="text-slate-300">صافي المبلغ المرسل</span><strong className="text-emerald-300">{money(Math.max(0, Number(amounts[plan._id]) || 0) - Math.round(Math.max(0, Number(amounts[plan._id]) || 0) * 0.05 * 1e8) / 1e8)} USDT</strong></div>
                    </div>

                    <div className="mt-auto space-y-2">
                      <button type="button" disabled={busy || hasPending || (!needsActiveReferrals && (!canWithdraw || !addresses[plan._id]?.trim() || !network))} onClick={() => handlePackageButtonClick(plan, needsActiveReferrals)} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
                        دفع
                      </button>
                      {packageMessages[plan._id] && <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-200">{packageMessages[plan._id]}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
            </div>
            )}
            {data && validSelectedSource === "general" && (
            <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Wallet size={20} className="text-cyan-300" />
                <h2 className="text-xl font-black">السحب العام</h2>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-2">
                <span className="text-xs text-slate-300">الرصيد المتاح من {generalSource === "deposit" ? "رصيد الإيداع" : "السحب العام"} · {selectedGeneralNetwork || "الشبكة المحددة"}</span>
                <strong className="mt-1 block text-lg font-black text-emerald-300">{data ? money(selectedGeneralAvailable) : "—"} USDT</strong>
              </div>
            </div>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>مصدر الرصيد</span>
              <select
                value={generalSource}
                onChange={(event) => setGeneralSource(event.target.value === "deposit" ? "deposit" : "wallet")}
                disabled={busy || hasPending}
                className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="wallet">رصيد السحب العام</option>
                <option value="deposit">رصيد الإيداع الخارجي (USDT)</option>
              </select>
              <p className="text-xs text-slate-500">رصيد الإيداع منفصل عن رصيد السحب، ويمكن استخدامه هنا فقط دون إضافته إلى رصيد السحب المعروض في الناف بار.</p>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm text-slate-300">
                <span>مبلغ السحب (USDT) — الحد الأدنى {data?.general.configured ? money(data.general.minimum) + " USDT" : "يحدده الأدمن"}</span>
                <input type="number" min={data?.general.minimum || undefined} max={selectedGeneralAvailable} step="0.00000001" value={generalAmount} disabled={busy || hasPending || !data?.general.configured} onChange={(event) => setGeneralAmount(event.target.value)} placeholder={data?.general.configured ? "الحد الأدنى " + money(data.general.minimum) : "الحد الأدنى يحدده الأدمن"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50" />
              </label>

              <label className="block space-y-2 text-sm text-slate-300">
                <span>عنوان السحب</span>
                <input value={generalAddress} maxLength={200} disabled={busy || hasPending} onChange={(event) => setGeneralAddress(event.target.value)} placeholder={selectedGeneralNetwork === "TRC20" ? "عنوان TRC20 يبدأ بـ T وطوله 34 حرفًا" : "عنوان BEP20 يبدأ بـ 0x وطوله 42 حرفًا"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50" />
              </label>

              <label className="block space-y-2 text-sm text-slate-300 sm:col-span-2">
                <span>شبكة السحب</span>
                <select value={selectedGeneralNetwork} onChange={(event) => setGeneralNetwork(event.target.value)} disabled={busy || hasPending || !data?.networks.length} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {!data?.networks.length && <option value="">لا توجد شبكات</option>}
                  {data?.networks.map((network) => <option key={network.code} value={network.code}>{network.name} ({network.code})</option>)}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#050a13] p-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="text-slate-400">العمولة ({data?.general.feePercent ?? 5}%): <strong className="text-amber-200">{money(Math.round(Math.max(0, Number(generalAmount) || 0) * (Number(data?.general.feePercent ?? 5) / 100) * 1e8) / 1e8)} USDT</strong></span>
                <span className="text-slate-300">صافي المبلغ: <strong className="text-emerald-300">{money(Math.max(0, Number(generalAmount) || 0) - Math.round(Math.max(0, Number(generalAmount) || 0) * (Number(data?.general.feePercent ?? 5) / 100) * 1e8) / 1e8)} USDT</strong></span>
              </div>
              <button type="button" onClick={submitGeneral} disabled={busy || hasPending || !data?.general.configured || !selectedGeneralNetwork || !data?.networks.length} className="min-w-32 rounded-lg bg-blue-600 px-8 py-3 font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? "جارٍ السحب..." : "سحب"}
              </button>
            </div>
            </div>
            )}
          </section>
          )}

          <section className="space-y-4 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">طلبات السحب وتاريخها</h2>
              <span className="text-xs text-slate-400">طلبات السحب العام وكل الباقات</span>
            </div>
            {!data ? (
              <p role="status" className="text-sm text-slate-400">سيظهر سجل الطلبات بعد وصول البيانات في الخلفية.</p>
            ) : !data.requests.length ? (
              <p className="rounded-xl border border-slate-700 p-4 text-sm text-slate-400">لا توجد طلبات سحب مسجلة حتى الآن.</p>
            ) : (
              <>
                <p className="text-xs text-slate-400">
                  عرض {(currentRequestsPage - 1) * requestsPerPage + 1}–{Math.min(currentRequestsPage * requestsPerPage, requestCount)} من {requestCount} طلب
                </p>
                <div className="space-y-3">
                {visibleRequests.map((item) => {
                  const plan = data.packages.find((candidate) => candidate._id === item.packageId);
                  const statusLabel = item.status === "approved"
                    ? "مقبول"
                    : item.status === "rejected"
                      ? "مرفوض"
                      : item.status === "pending"
                        ? "قيد المراجعة"
                        : item.status;
                  const createdDate = item.createdAt ? new Date(item.createdAt) : null;
                  const reviewedDate = item.reviewedAt ? new Date(item.reviewedAt) : null;
                  return (
                    <article key={item._id} className="rounded-xl border border-slate-700 bg-[#0b1422] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong>{item.type === "general" ? (item.generalSource === "deposit" ? "السحب العام — رصيد الإيداع" : "السحب العام") : plan?.name || "السحب من الباقات"}</strong>
                        <strong className="font-mono">{money(item.amount)} {item.asset || "USDT"}</strong>
                        <span className={item.status === "approved" ? "text-emerald-300" : item.status === "rejected" ? "text-red-300" : "text-amber-200"}>الحالة: {statusLabel}</span>
                      </div>
                      <div className="mt-2 rounded-lg bg-[#050a13] p-2 text-xs">
                        <div className="grid gap-1 text-slate-400 sm:grid-cols-3">
                          <p>العمولة: {money(item.feeAmount ?? 0)} USDT</p>
                          <p className="text-emerald-300">الصافي المطلوب إرساله: {money(item.payoutAmount ?? item.amount)} USDT</p>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                        <p>الشبكة: {item.network || "—"}</p>
                        <p>عنوان الدفع: <span className="break-all">{item.payoutAddress || "—"}</span></p>
                        <p>تاريخ الطلب: {createdDate && Number.isFinite(createdDate.getTime()) ? createdDate.toLocaleString("ar-EG") : "—"}</p>
                        {reviewedDate && Number.isFinite(reviewedDate.getTime()) && <p>تاريخ المراجعة: {reviewedDate.toLocaleString("ar-EG")}</p>}
                      </div>
                    </article>
                  );
                })}
                </div>
                {requestPageCount > 1 && (
                  <nav className="flex flex-wrap items-center justify-center gap-2 pt-2" aria-label="صفحات طلبات السحب">
                    <button
                      type="button"
                      onClick={() => setRequestsPage(Math.max(1, currentRequestsPage - 1))}
                      disabled={currentRequestsPage === 1}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      السابق
                    </button>
                    {Array.from({ length: requestPageCount }, (_, index) => index + 1).map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setRequestsPage(pageNumber)}
                        aria-current={currentRequestsPage === pageNumber ? "page" : undefined}
                        className={currentRequestsPage === pageNumber
                          ? "min-w-10 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-sm font-black text-cyan-200"
                          : "min-w-10 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.05]"}
                      >
                        {pageNumber}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRequestsPage(Math.min(requestPageCount, currentRequestsPage + 1))}
                      disabled={currentRequestsPage === requestPageCount}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      التالي
                    </button>
                  </nav>
                )}
              </>
            )}
          </section>
          </div>
        </main>
      </div>
    </>
  );
}
