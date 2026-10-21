"use client";

import { useEffect, useMemo, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { Check, Copy, ImagePlus, UploadCloud } from "lucide-react";

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
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkCode>("TRC20");

  const [amount, setAmount] = useState("");
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
      setScreenshot(null);
      setScreenshotPreview("");
      const latest = await fetch("/api/deposits", { credentials: "include", cache: "no-store" });
      const latestData = await latest.json().catch(() => ({}));
      if (latest.ok && latestData.success) {
        setDeposits(Array.isArray(latestData.deposits) ? latestData.deposits : []);
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
                <p className="mt-1 text-sm text-slate-400">أدخل بيانات التحويل وأرسل الطلب للمراجعة.</p>
                {loading && methods.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">يتم تحديث بيانات الشبكات في الخلفية…</p>
                )}
              </div>
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-sm font-black text-emerald-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-xs">$</span>
                USDT
              </span>
            </header>

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

            <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0b1725] to-[#08111e]">
              <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
                <h2 className="font-black">إيداع USDT</h2>
                <p className="mt-1 text-xs text-slate-500">أدخل مبلغ التحويل وارفع صورته.</p>
              </div>

              <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
                <div className="grid grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] items-end gap-3 sm:gap-4">
                  <label htmlFor="deposit-network" className="block min-w-0 text-xs font-bold text-slate-300">
                    <span className="mb-2 block">1. الشبكة</span>
                    <select
                      id="deposit-network"
                      value={selectedNetwork}
                      onChange={(event) => setSelectedNetwork(event.target.value as NetworkCode)}
                      disabled={!depositsEnabled || loading || sending}
                      className="h-12 w-full min-w-0 rounded-xl border border-white/10 bg-[#050a13] px-2 text-sm font-bold text-white outline-none focus:border-cyan-300/50 disabled:opacity-50 sm:px-3"
                    >
                      {NETWORK_OPTIONS.map((option) => {
                        const available = methods.some((method) => normalizeNetworkCode(method.network) === option.code);
                        return (
                          <option key={option.code} value={option.code} disabled={!available}>
                            {option.code === "TRC20" ? "TRC20" : "BEP20"}
                            {!available ? " — غير متاحة" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <div className="min-w-0">
                    <div className="mb-2 text-xs font-bold text-slate-300">2. عنوان الدفع</div>
                    <div className="flex min-w-0 items-stretch gap-2">
                      <div
                        dir="ltr"
                        className="flex min-h-12 min-w-0 flex-1 items-center break-all rounded-xl border border-white/[0.08] bg-[#030912] px-3 py-2 text-left font-mono text-[11px] leading-5 text-cyan-100 sm:text-xs"
                      >
                        {!depositsEnabled
                          ? <span dir="rtl" className="font-sans text-xs text-amber-200">الإيداع متوقف مؤقتًا</span>
                          : selected?.address || <span dir="rtl" className="font-sans text-xs text-slate-600">لا يوجد عنوان متاح</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyDepositAddress()}
                        disabled={!selected?.address || !depositsEnabled || sending}
                        aria-label={copiedAddress ? "تم نسخ عنوان الدفع" : "نسخ عنوان الدفع"}
                        title={copiedAddress ? "تم النسخ" : "نسخ العنوان"}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100 transition hover:bg-cyan-300/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {copiedAddress ? <Check size={17} /> : <Copy size={17} />}
                      </button>
                    </div>
                  </div>
                </div>

                {methods.length === 0 && !loading && (
                  <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100/90">
                    لا توجد وسيلة USDT مفعّلة حاليًا.
                  </div>
                )}
                {loading && methods.length === 0 && (
                  <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3 text-xs text-slate-500">
                    جاري تحميل شبكات الإيداع…
                  </div>
                )}

                <label htmlFor="deposit-amount" className="block text-xs font-bold text-slate-300">
                  <span className="mb-2 block">3. مبلغ الإيداع (USDT)</span>
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
                    placeholder="0.00"
                    className="h-12 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 text-base font-black text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 disabled:opacity-50"
                  />
                </label>

                <section>
                  <div className="mb-2 text-xs font-bold text-slate-300">4. ارفع صورة التحويل</div>
                  <label htmlFor="deposit-screenshot" className="block cursor-pointer rounded-xl border border-dashed border-cyan-200/25 bg-[#06121d] p-3 transition hover:border-cyan-200/45 hover:bg-cyan-200/[0.035]">
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-200/15 bg-cyan-200/[0.08] text-cyan-100">
                        <UploadCloud size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-white">{screenshot ? "تم اختيار صورة التحويل" : "اختيار Screenshot"}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">JPG أو PNG أو WEBP · بحد أقصى 4MB</span>
                      </span>
                      <ImagePlus size={18} className="shrink-0 text-cyan-200" />
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
                      <span className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-[#030912] p-2">
                        {screenshotPreview && <img src={screenshotPreview} alt="معاينة صورة التحويل" className="max-h-24 max-w-28 rounded-md object-contain" />}
                        <span className="min-w-0 break-all text-xs text-emerald-200">{screenshot.name}</span>
                      </span>
                    )}
                  </label>
                </section>

                <p className="text-[11px] leading-5 text-amber-100/70">
                  تأكد من مطابقة الشبكة قبل التحويل لتجنب فقدان الأموال.
                </p>

                <button
                  type="submit"
                  disabled={sending || loading || !selected || !depositsEnabled}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3.5 font-black text-[#03111c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
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