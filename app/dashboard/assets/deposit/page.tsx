"use client";

import { useEffect, useMemo, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { Check, Copy, ImagePlus, UploadCloud } from "lucide-react";

type DepositBalance = { asset: string; available: number; locked: number };
type DepositRecord = { _id?: string; id?: string; asset: string; network: string; amount: number; status: string; txHash?: string; adminNote?: string; createdAt?: string };

type PaymentLimits = { minDeposit: number; maxDeposit: number; minWithdrawal: number; minGeneralWithdrawal: number; maxWithdrawal: number; dailyWithdrawalLimit: number };

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
  const [selectedId, setSelectedId] = useState("");

  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);

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

      const json = await res.json();
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
      setSelectedId((current) => rows.some((method: Method) => method._id === current)
        ? current
        : rows[0]?._id || "");
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
        (method) => method._id === selectedId
      ) || null,
    [methods, selectedId]
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
        if (json.confirmed === false) {
          setMessage(`لم يتم تأكيد الإيداع بعد: ${Number(json.confirmations || 0)} من ${Number(json.requiredConfirmations || 1)} تأكيدات. يمكنك المحاولة مجددًا لاحقًا.`);
        } else {
          throw new Error(json.message || "تعذر التحقق من الإيداع");
        }
      } else {
        setMessage(json.alreadyProcessed
          ? "تم التحقق من أن هذا الإيداع عولج بالفعل."
          : `تم التحقق من المعاملة وإضافة ${Number(json.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${json.asset} إلى رصيد الإيداع.`);
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
        <main
          dir="rtl"
      className="min-h-screen w-full flex-1 bg-[#050a13] p-4 text-white sm:p-6"
    >
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-2 text-xs font-bold tracking-wide text-cyan-100">
            <span className="h-2 w-2 rounded-full bg-cyan-300" />
            USDT · TRC / BNB
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">إيداع USDT</h1>
          <p className="mt-2 text-sm text-slate-500">اختر الشبكة وأدخل بيانات التحويل.</p>
          {loading && methods.length > 0 && <p className="mt-2 text-xs text-slate-600">تحديث بيانات الشبكات في الخلفية…</p>}
        </header>

        <section className="mb-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <h2 className="text-sm font-bold text-slate-400">رصيد الإيداع</h2>
          {depositBalances.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">لا يوجد رصيد متاح حتى الآن.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {depositBalances.map((item) => (
                <div key={item.asset} className="rounded-xl border border-white/10 bg-[#050a13] p-4">
                  <div className="text-xs text-slate-500">{item.asset}</div>
                  <div className="mt-2 text-xl font-black text-cyan-300">
                    {Number(item.available || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-600">
                    محجوز: {Number(item.locked || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {message}
          </div>
        )}

        {!loading && !depositsEnabled && (
          <div role="status" className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 text-center text-sm text-amber-100">
            الإيداع متوقف مؤقتًا.
          </div>
        )}

        <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#0b1725] to-[#08111e] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-7">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label htmlFor="deposit-currency" className="block text-sm font-bold text-slate-300">
                العملة
                <select id="deposit-currency" defaultValue="USDT" className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050a13] px-4 py-3.5 font-black text-white outline-none focus:border-cyan-300/40">
                  <option value="USDT">USDT · Tether</option>
                </select>
              </label>
              <label htmlFor="deposit-network" className="block text-sm font-bold text-slate-300">
                الشبكة
                <select
                  id="deposit-network"
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050a13] px-4 py-3.5 font-bold text-white outline-none focus:border-cyan-300/40"
                >
                  <option value="">اختر شبكة الإيداع</option>
                  {methods.map((method) => (
                    <option key={method._id} value={method._id}>{method.network}</option>
                  ))}
                </select>
              </label>
            </div>

            {methods.length === 0 && !loading && (
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-sm text-amber-100/90">
                لا توجد وسيلة USDT مفعّلة على شبكة TRC أو BNB حاليًا.
              </div>
            )}
            {loading && methods.length === 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4 text-sm text-slate-500">
                جاري تحميل شبكات الإيداع…
              </div>
            )}

            <div className="rounded-2xl border border-cyan-300/15 bg-[#06121d] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-500">عنوان الإيداع</div>
                  <div className="mt-1 font-bold text-white">{selected ? `USDT · ${selected.network}` : "اختر الشبكة لعرض العنوان"}</div>
                </div>
                {selected?.address && (
                  <button type="button" onClick={() => void copyDepositAddress()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-cyan-300/30">
                    {copiedAddress ? <Check size={15} /> : <Copy size={15} />}
                    {copiedAddress ? "تم النسخ" : "نسخ العنوان"}
                  </button>
                )}
              </div>
              <div className="mt-4 min-h-[74px] rounded-xl border border-white/[0.06] bg-[#030912] p-4 font-mono text-sm leading-6 text-cyan-100 sm:text-base">
                {selected?.address || <span className="font-sans text-sm text-slate-600">سيظهر هنا عنوان الشبكة الذي أضافه الأدمن.</span>}
              </div>
              {selected && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <span className="text-sm text-slate-400">الحد الأدنى للإيداع</span>
                  <strong className="text-lg font-black text-emerald-200">
                    {Math.max(Number(selected.minDeposit || 0), Number(limits.minDeposit || 0)).toLocaleString("en-US", { maximumFractionDigits: 8 })} <span className="text-sm">USDT</span>
                  </strong>
                </div>
              )}
            </div>

            <label htmlFor="deposit-screenshot" className="block cursor-pointer rounded-2xl border border-dashed border-cyan-200/25 bg-cyan-200/[0.025] p-5 transition hover:border-cyan-200/45 hover:bg-cyan-200/[0.045] sm:p-6">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.08] text-cyan-100"><UploadCloud size={22}/></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black text-white">صورة التحويل (Screenshot)</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">اضغط لاختيار صورة واضحة · JPG أو PNG أو WEBP · حتى 4MB</span>
                </span>
                <ImagePlus size={20} className="shrink-0 text-cyan-200"/>
              </span>
              <input
                id="deposit-screenshot"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setScreenshot(file);
                  setScreenshotPreview(file ? URL.createObjectURL(file) : "");
                }}
                className="sr-only"
              />
              {screenshot && (
                <span className="mt-4 block overflow-hidden rounded-xl border border-white/10 bg-[#030912] p-3">
                  {screenshotPreview && <img src={screenshotPreview} alt="معاينة صورة التحويل" className="mx-auto max-h-56 w-auto rounded-lg object-contain"/>}
                  <span className="mt-2 block break-all text-center text-xs text-emerald-200">{screenshot.name}</span>
                </span>
              )}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label htmlFor="deposit-amount" className="block text-sm font-bold text-slate-300">
                مبلغ الإيداع (USDT)
                <input
                  id="deposit-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  type="number"
                  min={Math.max(Number(selected?.minDeposit || 0), Number(limits.minDeposit || 0))}
                  max={(() => { const values = [Number(selected?.maxDeposit || 0), Number(limits.maxDeposit || 0)].filter((value) => value > 0); return values.length ? Math.min(...values) : undefined; })()}
                  step="any"
                  required
                  placeholder="اكتب المبلغ"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050a13] px-4 py-3.5 text-lg font-black text-white outline-none focus:border-cyan-300/40"
                />
              </label>
              <label htmlFor="deposit-txhash" className="block text-sm font-bold text-slate-300">
                رقم المعاملة <span className="font-normal text-slate-600">(اختياري)</span>
                <input
                  id="deposit-txhash"
                  value={txHash}
                  onChange={(event) => setTxHash(event.target.value)}
                  placeholder="TX Hash"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050a13] px-4 py-3.5 font-mono text-sm text-white outline-none focus:border-cyan-300/40"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={sending || loading || !selected || !depositsEnabled}
              className="w-full rounded-2xl bg-cyan-300 px-5 py-4 font-black text-[#03111c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? "جاري إرسال طلب الإيداع…" : !depositsEnabled ? "الإيداع متوقف مؤقتًا" : "تأكيد الإيداع"}
            </button>
          </form>
        </section>

        <section className="mt-7 rounded-2xl border border-slate-800 bg-[#08111e] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black">سجل طلبات الإيداع</h2>
            <button type="button" onClick={() => void loadMethods()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">تحديث السجل</button>
          </div>
          {deposits.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">لم ترسل طلبات إيداع بعد.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {deposits.map((item, index) => (
                <div key={String(item._id || item.id || index)} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#050a13] p-4">
                  <div>
                    <div className="font-bold">{Number(item.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {item.asset}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.network} · {item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime()) ? new Date(item.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "—"}</div>
                    {item.txHash && <div className="mt-2 max-w-xl break-all font-mono text-[10px] text-slate-600">TX: {item.txHash}</div>}
                    {item.adminNote && <div className="mt-2 text-xs text-slate-400">ملاحظة الإدارة: {item.adminNote}</div>}
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <span className={item.status === "approved" ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300" : item.status === "rejected" ? "rounded-full bg-red-400/10 px-3 py-1 text-xs font-bold text-red-300" : "rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200"}>
                      {item.status === "approved" ? "معتمد — أضيف لرصيد الإيداع" : item.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                    </span>
                    {item.status === "pending" && item.txHash && methods.some((method) => method.source === "asset-network" && method.asset === item.asset && method.network.toUpperCase() === item.network.toUpperCase()) && (
                      <button type="button" disabled={Boolean(verifyingId)} onClick={() => void verifyBlockchainDeposit(item)} className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-50">
                        {verifyingId === String(item._id || item.id) ? "جاري التحقق..." : "التحقق من البلوكشين"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
        </main>
      </div>
    </>
  );
}