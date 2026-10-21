"use client";

import { useEffect, useMemo, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { Check, Copy, ImagePlus, UploadCloud } from "lucide-react";

type DepositBalance = { asset: string; available: number; locked: number };
type DepositRecord = { _id?: string; id?: string; asset: string; network: string; amount: number; status: string; txHash?: string; adminNote?: string; createdAt?: string };

type PaymentLimits = { minDeposit: number; maxDeposit: number; minWithdrawal: number; minGeneralWithdrawal: number; maxWithdrawal: number; dailyWithdrawalLimit: number };

type NetworkCode = "TRC20" | "BEP20";

const NETWORK_OPTIONS: Array<{ code: NetworkCode; label: string }> = [
  { code: "TRC20", label: "TRX (TRC20)" },
  { code: "BEP20", label: "BNB Smart Chain (BEP20)" },
];

function normalizeNetworkCode(value: string): NetworkCode | "" {
  const code = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["TRC", "TRC20", "TRON", "TRONTRC20", "TRX"].includes(code)) return "TRC20";
  if (["BNB", "BSC", "BEP20", "BNBSMARTCHAIN", "BNBSMARTCHAINBEP20"].includes(code)) return "BEP20";
  return "";
}

function networkLabel(value: string) {
  return NETWORK_OPTIONS.find((option) => option.code === normalizeNetworkCode(value))?.label || value;
}

type Method = {
  _id: string;
  name: string;
  asset: string;
  network: string;
  address: string;
  minDeposit: number;
  maxDeposit?: number;
  minWithdrawal: number;
  enabled: boolean;
  depositEnabled?: boolean;
  withdrawalEnabled?: boolean;
  source?: string;
};

export default function DepositPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [depositsEnabled, setDepositsEnabled] = useState(true);
  const [limits, setLimits] = useState<PaymentLimits>({ minDeposit: 0, maxDeposit: 0, minWithdrawal: 0, minGeneralWithdrawal: 0, maxWithdrawal: 0, dailyWithdrawalLimit: 0 });
  const [depositBalances, setDepositBalances] = useState<DepositBalance[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkCode>("TRC20");

  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifyingId, setVerifyingId] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadMethods();
    const refresh = window.setInterval(() => {
      void loadMethods(true);
    }, 60000);
    return () => window.clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (!screenshotPreview) return;
    return () => URL.revokeObjectURL(screenshotPreview);
  }, [screenshotPreview]);

  async function loadMethods(background = false) {
    if (!background) setLoading(true);
    if (!background) setError("");

    try {
      const [res, balanceRes] = await Promise.all([
        fetch("/api/payment-options", { cache: "no-store" }),
        fetch("/api/deposits", { credentials: "include", cache: "no-store" }),
      ]);

      const json = await res.json().catch(() => ({}));
      setDepositsEnabled(json.depositsEnabled !== false);
      if (json.limits) {
        setLimits({
          minDeposit: Number(json.limits.minDeposit || 0),
          maxDeposit: Number(json.limits.maxDeposit || 0),
          minWithdrawal: Number(json.limits.minWithdrawal || 0),
          minGeneralWithdrawal: Number(json.limits.minGeneralWithdrawal || 0),
          maxWithdrawal: Number(json.limits.maxWithdrawal || 0),
          dailyWithdrawalLimit: Number(json.limits.dailyWithdrawalLimit || 0),
        });
      }
      const balanceJson = await balanceRes.json().catch(() => ({}));
      setDepositBalances(
        Array.isArray(balanceJson.depositBalances) ? balanceJson.depositBalances : []
      );
      setDeposits(Array.isArray(balanceJson.deposits) ? balanceJson.deposits : []);

      if (!res.ok || !json.success) {
        throw new Error(
          json.message || "تعذر تحميل وسائل الدفع"
        );
      }

      const rows = Array.isArray(json.methods)
        ? json.methods.filter((method: Method) => {
            const network = String(method.network || "");
            return String(method.asset || "").toUpperCase() === "USDT" &&
              /trc|tron|bnb|bep20|bsc|binance/i.test(network) &&
              method.enabled !== false &&
              method.depositEnabled !== false &&
              Boolean(String(method.address || "").trim());
          })
        : [];

      setMethods(rows);
      setSelectedNetwork((current) => {
        const availableCodes = rows
          .map((method: Method) => normalizeNetworkCode(method.network))
          .filter(Boolean);
        if (availableCodes.includes(current)) return current;
        return NETWORK_OPTIONS.find((option) => availableCodes.includes(option.code))?.code || "TRC20";
      });
    } catch (e) {
      if (!background) {
        setError(e instanceof Error ? e.message : "تعذر تحميل وسائل الإيداع");
      } else {
        console.warn("Background deposit options refresh failed", e);
      }
    } finally {
      if (!background) setLoading(false);
    }
  }

  const selected = useMemo(
    () =>
      methods.find(
        (method) => normalizeNetworkCode(method.network) === selectedNetwork
      ) || null,
    [methods, selectedNetwork]
  );

  async function verifyBlockchainDeposit(item: DepositRecord) {
    const id = String(item._id || item.id || "");
    if (!id || !item.txHash) return;
    setVerifyingId(id);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/blockchain/verify-deposit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (json.reason === "confirmations_pending") {
          setMessage(`المعاملة مطابقة، لكن التأكيدات ما زالت ${Number(json.confirmations || 0)} من ${Number(json.requiredConfirmations || 1)}. يمكنك المحاولة مجددًا لاحقًا.`);
        } else {
          throw new Error(json.message || "تعذر التحقق من الإيداع");
        }
      } else {
        setMessage(json.alreadyProcessed
          ? "تم التحقق من أن هذا الإيداع عولج بالفعل."
          : `تم التحقق من المعاملة وإضافة ${Number(json.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${json.asset} إلى رصيد الإيداع المنفصل.`);
      }

      const latest = await fetch("/api/deposits", { credentials: "include", cache: "no-store" });
      const latestData = await latest.json().catch(() => ({}));
      if (latest.ok && latestData.success) {
        setDeposits(Array.isArray(latestData.deposits) ? latestData.deposits : []);
        setDepositBalances(Array.isArray(latestData.depositBalances) ? latestData.depositBalances : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحقق من الإيداع");
    } finally {
      setVerifyingId("");
    }
  }

  async function copyDepositAddress() {
    if (!selected?.address) return;
    try {
      await navigator.clipboard.writeText(selected.address);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 1800);
    } catch {
      setError("تعذر النسخ تلقائيًا. يمكنك تحديد العنوان ونسخه يدويًا.");
    }
  }

  async function submit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setSending(true);
    setError("");
    setMessage("");

    try {
      if (!selected) {
        throw new Error("اختر وسيلة دفع");
      }

      if (!selected.enabled) {
        throw new Error("وسيلة الدفع متوقفة");
      }

      if (!screenshot) {
        throw new Error("ارفع Screenshot للتحويل");
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(screenshot.type)) {
        throw new Error("صيغة الصورة يجب أن تكون JPG أو PNG أو WEBP");
      }
      if (screenshot.size > 4 * 1024 * 1024) {
        throw new Error("حجم الصورة يجب ألا يتجاوز 4MB");
      }
      if (txHash.length > 256 || /[\u0000-\u001F\u007F]/.test(txHash)) {
        throw new Error("رقم المعاملة غير صالح أو أطول من الحد المسموح");
      }

      const numericAmount = Number(amount);

      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {
        throw new Error("أدخل مبلغًا صحيحًا");
      }

      const minimumDeposit = Math.max(Number(selected.minDeposit || 0), Number(limits.minDeposit || 0));
      const configuredMaximums = [Number(selected.maxDeposit || 0), Number(limits.maxDeposit || 0)].filter((value) => value > 0);
      const maximumDeposit = configuredMaximums.length ? Math.min(...configuredMaximums) : 0;
      if (numericAmount < minimumDeposit) {
        throw new Error("الحد الأدنى للإيداع هو " + minimumDeposit + " " + selected.asset);
      }
      if (maximumDeposit > 0 && numericAmount > maximumDeposit) {
        throw new Error("الحد الأقصى للإيداع هو " + maximumDeposit + " " + selected.asset);
      }

      const form = new FormData();

      form.append("asset", selected.asset);
      form.append("network", selected.network);
      form.append("amount", amount);
      form.append("txHash", txHash);
      form.append("screenshot", screenshot);

      const res = await fetch("/api/deposits", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json.message || "تعذر إنشاء طلب الإيداع"
        );
      }

      setMessage(
        "تم إرسال طلب الإيداع للمراجعة."
      );

      setAmount("");
      setTxHash("");
      setScreenshot(null);
      setScreenshotPreview("");
      const latest = await fetch("/api/deposits", { credentials: "include", cache: "no-store" });
      const latestData = await latest.json().catch(() => ({}));
      if (latest.ok && latestData.success) {
        setDeposits(Array.isArray(latestData.deposits) ? latestData.deposits : []);
        setDepositBalances(Array.isArray(latestData.depositBalances) ? latestData.depositBalances : []);
      }

      const input = document.getElementById(
        "deposit-screenshot"
      ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "حدث خطأ أثناء إرسال طلب الإيداع"
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-h-screen w-full min-w-0 flex-1 bg-[#050a13] p-3 text-white sm:p-6">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">إيداع USDT</h1>
                <p className="mt-1 text-sm text-slate-400">اتبع الخطوات بالترتيب لإرسال طلب الإيداع.</p>
                {loading && methods.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">يتم تحديث بيانات الشبكات في الخلفية…</p>
                )}
              </div>
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-sm font-black text-emerald-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-xs">$</span>
                USDT
              </span>
            </header>

            <section className="rounded-2xl border border-cyan-400/15 bg-[#081521] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-200">رصيد الإيداع</h2>
                  <p className="mt-1 text-xs text-slate-500">رصيد منفصل عن محفظة التداول.</p>
                </div>
                <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">USDT</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.06] bg-[#050a13] p-3">
                  <p className="text-xs text-slate-500">المتاح</p>
                  <p className="mt-1 text-xl font-black text-cyan-200">
                    {depositBalances.filter((item) => item.asset === "USDT").reduce((sum, item) => sum + Number(item.available || 0), 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                    <span className="mr-1 text-xs font-medium text-slate-500">USDT</span>
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-[#050a13] p-3">
                  <p className="text-xs text-slate-500">المحجوز</p>
                  <p className="mt-1 text-xl font-black text-amber-200">
                    {depositBalances.filter((item) => item.asset === "USDT").reduce((sum, item) => sum + Number(item.locked || 0), 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                    <span className="mr-1 text-xs font-medium text-slate-500">USDT</span>
                  </p>
                </div>
              </div>
            </section>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3 text-sm leading-6 text-red-200">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {message && (
              <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-3 text-sm leading-6 text-emerald-200">
                <Check size={17} className="mt-0.5 shrink-0" />
                <span>{message}</span>
              </div>
            )}

            {!loading && !depositsEnabled && (
              <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 text-center text-sm text-amber-100">
                الإيداع متوقف مؤقتًا.
              </div>
            )}

            <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#0b1725] to-[#08111e] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
              <div className="border-b border-white/[0.06] px-4 py-4 sm:px-6">
                <h2 className="font-black">إرسال طلب إيداع</h2>
                <p className="mt-1 text-xs text-slate-500">تأكد من اختيار الشبكة الصحيحة قبل تحويل الأموال.</p>
              </div>

              <form onSubmit={submit} className="space-y-6 p-4 sm:p-6">
                <section className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-xs font-black text-cyan-200">1</span>
                    <div>
                      <h3 className="text-sm font-black text-slate-100">اختار الشبكة</h3>
                      <p className="mt-1 text-xs text-slate-500">لازم الشبكة تطابق الشبكة اللي هتحوّل منها.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {NETWORK_OPTIONS.map((option) => {
                      const available = methods.some((method) => normalizeNetworkCode(method.network) === option.code);
                      const active = selectedNetwork === option.code;
                      return (
                        <button
                          key={option.code}
                          type="button"
                          aria-pressed={active}
                          disabled={!available || !depositsEnabled || loading || sending}
                          onClick={() => setSelectedNetwork(option.code)}
                          className={"flex items-center justify-between gap-3 rounded-2xl border p-4 text-right transition disabled:cursor-not-allowed disabled:opacity-40 " + (
                            active
                              ? "border-cyan-300/60 bg-cyan-300/[0.08] shadow-[inset_0_0_0_1px_rgba(103,232,249,0.08)]"
                              : "border-white/10 bg-[#050a13] hover:border-white/20 hover:bg-white/[0.025]"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black " + (active ? "bg-cyan-300/15 text-cyan-200" : "bg-white/[0.04] text-slate-300")}>
                              {option.code === "TRC20" ? "TRX" : "BNB"}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-black text-slate-100">{option.label}</span>
                              <span className="mt-1 block text-xs text-slate-500">{available ? "متاحة للإيداع" : "غير مفعّلة حاليًا"}</span>
                            </span>
                          </span>
                          <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full border " + (active ? "border-cyan-300 bg-cyan-300 text-[#03111c]" : "border-slate-600 text-transparent")}>
                            {active ? <Check size={13} /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {methods.length === 0 && !loading && (
                    <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-sm leading-6 text-amber-100/90">
                      لا توجد وسيلة USDT مفعّلة على شبكة TRC أو BNB حاليًا.
                    </div>
                  )}
                  {loading && methods.length === 0 && (
                    <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3 text-sm text-slate-500">
                      جاري تحميل شبكات الإيداع…
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-xs font-black text-cyan-200">2</span>
                    <div>
                      <h3 className="text-sm font-black text-slate-100">حوّل إلى عنوان الإيداع</h3>
                      <p className="mt-1 text-xs text-slate-500">انسخ العنوان الظاهر أدناه، وتأكد من إرسال USDT على الشبكة المختارة فقط.</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan-300/15 bg-[#06121d] p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-500">عنوان المحفظة</p>
                        <p className="mt-1 text-sm font-bold text-slate-200">{selected ? networkLabel(selected.network) : networkLabel(selectedNetwork)}</p>
                      </div>
                      {selected?.address && depositsEnabled && (
                        <button
                          type="button"
                          onClick={() => void copyDepositAddress()}
                          className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2.5 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/[0.12]"
                        >
                          {copiedAddress ? <Check size={15} /> : <Copy size={15} />}
                          {copiedAddress ? "تم النسخ" : "نسخ العنوان"}
                        </button>
                      )}
                    </div>
                    <div dir="ltr" className="mt-3 min-h-[68px] break-all rounded-xl border border-white/[0.06] bg-[#030912] p-4 text-left font-mono text-sm leading-6 text-cyan-100 sm:text-base">
                      {!depositsEnabled
                        ? <span dir="rtl" className="font-sans text-sm text-amber-200">الإيداع متوقف حاليًا. لا ترسل أموالًا حتى يعاد تفعيل الخدمة.</span>
                        : selected?.address || <span dir="rtl" className="font-sans text-sm text-slate-600">سيظهر هنا عنوان الشبكة الذي أضافه الأدمن.</span>}
                    </div>
                    {selected && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <span className="text-xs text-slate-400">الحد الأدنى للإيداع</span>
                        <strong className="text-sm font-black text-emerald-200">
                          {Math.max(Number(selected.minDeposit || 0), Number(limits.minDeposit || 0)).toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT
                        </strong>
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-xs font-black text-cyan-200">3</span>
                    <div>
                      <h3 className="text-sm font-black text-slate-100">اكتب بيانات التحويل</h3>
                      <p className="mt-1 text-xs text-slate-500">المبلغ مطلوب، ورقم المعاملة اختياري إذا لم يكن متاحًا.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label htmlFor="deposit-amount" className="block text-sm font-bold text-slate-300">
                      <span className="block">مبلغ الإيداع (USDT)</span>
                      <input
                        id="deposit-amount"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        disabled={!depositsEnabled || sending}
                        type="number"
                        min={Math.max(Number(selected?.minDeposit || 0), Number(limits.minDeposit || 0))}
                        max={(() => { const values = [Number(selected?.maxDeposit || 0), Number(limits.maxDeposit || 0)].filter((value) => value > 0); return values.length ? Math.min(...values) : undefined; })()}
                        step="any"
                        required
                        placeholder="اكتب المبلغ المراد إيداعه"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3.5 text-lg font-black text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 disabled:opacity-50"
                      />
                      {selected && (
                        <span className="mt-2 block text-[11px] font-normal text-slate-500">
                          الحد الأدنى {Math.max(Number(selected.minDeposit || 0), Number(limits.minDeposit || 0)).toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT
                          {([Number(selected.maxDeposit || 0), Number(limits.maxDeposit || 0)].filter((value) => value > 0).length > 0)
                            ? " · الحد الأقصى " + Math.min(...[Number(selected.maxDeposit || 0), Number(limits.maxDeposit || 0)].filter((value) => value > 0)).toLocaleString("en-US", { maximumFractionDigits: 8 }) + " USDT"
                            : ""}
                        </span>
                      )}
                    </label>

                    <label htmlFor="deposit-txhash" className="block text-sm font-bold text-slate-300">
                      <span className="block">رقم المعاملة <span className="font-normal text-slate-500">(اختياري)</span></span>
                      <input
                        id="deposit-txhash"
                        value={txHash}
                        onChange={(event) => setTxHash(event.target.value)}
                        maxLength={256}
                        disabled={!depositsEnabled || sending}
                        placeholder="TX Hash"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3.5 font-mono text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 disabled:opacity-50"
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-xs font-black text-cyan-200">4</span>
                    <div>
                      <h3 className="text-sm font-black text-slate-100">ارفع إثبات التحويل</h3>
                      <p className="mt-1 text-xs text-slate-500">الصورة مطلوبة لمراجعة طلب الإيداع.</p>
                    </div>
                  </div>

                  <label htmlFor="deposit-screenshot" className="block cursor-pointer rounded-2xl border border-dashed border-cyan-200/25 bg-[#06121d] p-4 transition hover:border-cyan-200/45 hover:bg-cyan-200/[0.035] sm:p-5">
                    <span className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/[0.08] text-cyan-100">
                        <UploadCloud size={21} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-black text-white">{screenshot ? "تم اختيار صورة التحويل" : "اضغط لاختيار صورة التحويل"}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">JPG أو PNG أو WEBP · الحد الأقصى 4MB</span>
                      </span>
                      <ImagePlus size={19} className="shrink-0 text-cyan-200" />
                    </span>
                    <input
                      id="deposit-screenshot"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!depositsEnabled || sending}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                          setScreenshot(null);
                          setScreenshotPreview("");
                          setError("صيغة الصورة يجب أن تكون JPG أو PNG أو WEBP");
                          event.target.value = "";
                          return;
                        }
                        if (file && file.size > 4 * 1024 * 1024) {
                          setScreenshot(null);
                          setScreenshotPreview("");
                          setError("حجم الصورة يجب ألا يتجاوز 4MB");
                          event.target.value = "";
                          return;
                        }
                        setError("");
                        setScreenshot(file);
                        setScreenshotPreview(file ? URL.createObjectURL(file) : "");
                      }}
                      className="sr-only"
                    />
                    {screenshot && (
                      <span className="mt-4 block overflow-hidden rounded-xl border border-white/10 bg-[#030912] p-3">
                        {screenshotPreview && <img src={screenshotPreview} alt="معاينة صورة التحويل" className="mx-auto max-h-56 w-auto rounded-lg object-contain" />}
                        <span className="mt-2 block break-all text-center text-xs text-emerald-200">{screenshot.name}</span>
                      </span>
                    )}
                  </label>
                </section>

                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.035] p-3 text-xs leading-6 text-amber-100/80">
                  تأكد من الشبكة وعنوان المحفظة والمبلغ قبل الإرسال. إرسال USDT عبر شبكة غير مطابقة قد يؤدي إلى فقدان الأموال.
                </div>

                <button
                  type="submit"
                  disabled={sending || loading || !selected || !depositsEnabled}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-4 font-black text-[#03111c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? "جاري إرسال طلب الإيداع…" : !depositsEnabled ? "الإيداع متوقف مؤقتًا" : "تأكيد الإيداع"}
                </button>
              </form>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
              <button
                type="button"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 p-4 text-right transition hover:bg-white/[0.025] sm:p-5"
              >
                <span>
                  <span className="block text-base font-black">سجل طلبات الإيداع</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {deposits.length.toLocaleString("ar-EG")} طلب · السجل منفصل عن نموذج الإيداع
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  {historyOpen ? "إخفاء السجل" : "عرض السجل"}
                  <span className="text-base">{historyOpen ? "−" : "+"}</span>
                </span>
              </button>

              {historyOpen && (
                <div className="border-t border-slate-800 p-4 sm:p-5">
                  <div className="mb-4 flex justify-end">
                    <button type="button" onClick={() => void loadMethods()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.04] disabled:opacity-50">
                      تحديث السجل
                    </button>
                  </div>
                  {deposits.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">لم ترسل طلبات إيداع بعد.</p>
                  ) : (
                    <div className="space-y-3">
                      {deposits.map((item, index) => (
                        <div key={String(item._id || item.id || index)} className="rounded-xl border border-white/10 bg-[#050a13] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-base font-black">{Number(item.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {item.asset}</div>
                              <div className="mt-1 text-xs text-slate-500">{networkLabel(item.network)} · {item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime()) ? new Date(item.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "—"}</div>
                            </div>
                            <span className={item.status === "approved" ? "rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-300" : item.status === "rejected" ? "rounded-full bg-red-400/10 px-3 py-1.5 text-xs font-bold text-red-300" : "rounded-full bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200"}>
                              {item.status === "approved" ? "معتمد — أضيف إلى رصيد الإيداع" : item.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                            </span>
                          </div>
                          {item.txHash && <div className="mt-3 rounded-lg bg-white/[0.025] p-3"><p className="text-[10px] text-slate-500">رقم المعاملة</p><p dir="ltr" className="mt-1 break-all text-left font-mono text-xs text-slate-300">{item.txHash}</p></div>}
                          {item.adminNote && <div className="mt-2 text-xs leading-5 text-slate-400">ملاحظة الإدارة: {item.adminNote}</div>}
                          {item.status === "pending" && item.txHash && methods.some((method) => method.source === "asset-network" && method.asset === item.asset && method.network.toUpperCase() === item.network.toUpperCase()) && (
                            <button type="button" disabled={Boolean(verifyingId)} onClick={() => void verifyBlockchainDeposit(item)} className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-50">
                              {verifyingId === String(item._id || item.id) ? "جاري التحقق..." : "التحقق من البلوكشين"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}