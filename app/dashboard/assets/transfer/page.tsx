"use client";

import { useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { ArrowLeftRight, RefreshCw, Wallet } from "lucide-react";

type WalletType = "spot" | "funding";

type Balance = {
  asset: string;
  available: number;
  locked: number;
  total?: number;
};

function formatAmount(value: number) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 12,
  });
}

function walletLabel(type: WalletType) {
  return type === "spot" ? "محفظة التداول" : "محفظة التمويل";
}

export default function TransferPage() {
  const [spotBalances, setSpotBalances] = useState<Balance[]>([]);
  const [fundingBalances, setFundingBalances] = useState<Balance[]>([]);
  const [asset, setAsset] = useState("");
  const [from, setFrom] = useState<WalletType>("spot");
  const [to, setTo] = useState<WalletType>("funding");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  async function load(background = false) {
    if (!background) {
      setLoading(true);
      setError("");
    } else {
      setRefreshing(true);
    }

    try {
      const res = await fetch("/api/wallet", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "تعذر تحميل المحافظ");
      }

      const spot = data.spot?.balances ?? data.wallet?.balances ?? [];
      const funding = data.funding?.balances ?? [];
      const normalize = (rows: any[]): Balance[] =>
        Array.isArray(rows)
          ? rows.map((row) => ({
              asset: String(row.asset || "").trim().toUpperCase(),
              available: Number(row.available || 0),
              locked: Number(row.locked || 0),
              total: Number(row.total ?? Number(row.available || 0) + Number(row.locked || 0)),
            })).filter((row) => Boolean(row.asset))
          : [];

      const spotRows = normalize(spot);
      const fundingRows = normalize(funding);
      setSpotBalances(spotRows);
      setFundingBalances(fundingRows);

      const sourceRows = from === "spot" ? spotRows : fundingRows;
      setAsset((current) =>
        sourceRows.some((row) => row.asset === current)
          ? current
          : sourceRows.find((row) => row.available > 0)?.asset || ""
      );
    } catch (e) {
      const messageText = e instanceof Error ? e.message : "تعذر تحميل المحافظ";
      if (!background || (spotBalances.length === 0 && fundingBalances.length === 0)) {
        setError(messageText);
      }
    } finally {
      if (!background) setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 10000);
    return () => window.clearInterval(timer);
  }, [from]);

  const sourceBalances = from === "spot" ? spotBalances : fundingBalances;
  const destinationBalances = to === "spot" ? spotBalances : fundingBalances;
  const selectedSourceBalance = sourceBalances.find((balance) => balance.asset === asset);
  const selectedDestinationBalance = destinationBalances.find((balance) => balance.asset === asset);
  const available = Number(selectedSourceBalance?.available || 0);
  const amountValue = Number(amount);
  const canSubmit =
    !loading &&
    !submitting &&
    from !== to &&
    Boolean(asset) &&
    amount.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    amountValue <= available;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (from === to) {
      setError("محفظة المصدر والوجهة يجب أن تكونا مختلفتين");
      return;
    }
    if (!asset) {
      setError("اختر أصلًا لديه رصيد متاح في المحفظة المصدر");
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0 || amountValue > available) {
      setError("أدخل مبلغًا موجبًا لا يتجاوز الرصيد المتاح");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    const key = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(key);

    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          asset,
          amount: amountValue,
          from,
          to,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "تعذر تنفيذ التحويل");
      }

      setMessage(data.message || "تم تنفيذ التحويل");
      setAmount("");
      setIdempotencyKey("");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ التحويل");
    } finally {
      setSubmitting(false);
    }
  }

  const sourceAvailable = sourceBalances.reduce((sum, balance) => sum + balance.available, 0);
  const destinationAvailable = destinationBalances.reduce((sum, balance) => sum + balance.available, 0);

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px] min-h-[calc(100vh-4rem)]">
        <InternalSidebar />
        <main dir="rtl" className="min-w-0 min-h-screen flex-1 bg-[#050a13] p-4 text-white sm:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="mb-2 text-xs text-slate-500">المحفظة / التحويل الداخلي</div>
                <h1 className="text-2xl font-bold sm:text-3xl">التحويل الداخلي</h1>
                <p className="mt-2 text-sm text-slate-400">
                  نقل الرصيد بين محفظة التداول ومحفظة التمويل داخل حسابك فقط، دون إيداع أو سحب خارجي.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading || refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                تحديث الأرصدة
              </button>
            </header>

            {error && (
              <div role="alert" className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                {error}
              </div>
            )}
            {message && (
              <div role="status" className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
                {message}
              </div>
            )}

            <section className="mb-5 grid gap-4 sm:grid-cols-2">
              {([
                { type: from, title: "محفظة المصدر", count: sourceAvailable, balance: selectedSourceBalance },
                { type: to, title: "محفظة الوجهة", count: destinationAvailable, balance: selectedDestinationBalance },
              ] as const).map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">{item.title}</div>
                      <div className="mt-1 text-base font-bold">{walletLabel(item.type)}</div>
                    </div>
                    <div className="rounded-xl border border-cyan-400/10 bg-cyan-400/[0.06] p-3 text-cyan-300">
                      <Wallet size={19} />
                    </div>
                  </div>
                  {asset ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-black/20 p-3">
                        <div className="text-[11px] text-slate-500">{asset} متاح</div>
                        <div className="mt-1 break-all font-mono text-sm font-bold text-white">
                          {formatAmount(item.balance?.available || 0)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-black/20 p-3">
                        <div className="text-[11px] text-slate-500">{asset} محجوز</div>
                        <div className="mt-1 break-all font-mono text-sm text-amber-200">
                          {formatAmount(item.balance?.locked || 0)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-slate-500">
                      {loading ? "جاري تحميل الأرصدة…" : "اختر أصلًا لعرض رصيد المحفظة."}
                    </div>
                  )}
                  <div className="mt-3 text-[11px] text-slate-600">
                    مجموع الأرصدة المتاحة داخل هذه المحفظة: {formatAmount(item.count)} {asset || ""}
                  </div>
                </div>
              ))}
            </section>

            <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#07101d] p-4 sm:p-6">
              <div className="mb-5 flex items-center gap-2">
                <ArrowLeftRight size={18} className="text-cyan-300" />
                <h2 className="text-base font-bold">تفاصيل التحويل</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-300">
                  من المحفظة
                  <select
                    value={from}
                    onChange={(event) => {
                      const value = event.target.value as WalletType;
                      setFrom(value);
                      setTo(value === "spot" ? "funding" : "spot");
                      setAsset("");
                      setAmount("");
                      setIdempotencyKey("");
                      setMessage("");
                    }}
                    disabled={submitting}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/40 disabled:opacity-50"
                  >
                    <option value="spot">التداول (Spot)</option>
                    <option value="funding">التمويل (Funding)</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold text-slate-300">
                  إلى المحفظة
                  <select
                    value={to}
                    onChange={(event) => {
                      setTo(event.target.value as WalletType);
                      setIdempotencyKey("");
                      setMessage("");
                    }}
                    disabled={submitting}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/40 disabled:opacity-50"
                  >
                    <option value="funding" disabled={from === "funding"}>التمويل (Funding)</option>
                    <option value="spot" disabled={from === "spot"}>التداول (Spot)</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold text-slate-300">
                  الأصل
                  <select
                    value={asset}
                    onChange={(event) => {
                      setAsset(event.target.value);
                      setAmount("");
                      setIdempotencyKey("");
                      setMessage("");
                    }}
                    disabled={loading || submitting || sourceBalances.length === 0}
                    required
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/40 disabled:opacity-50"
                  >
                    <option value="">اختر العملة</option>
                    {sourceBalances.map((balance) => (
                      <option key={balance.asset} value={balance.asset} disabled={balance.available <= 0}>
                        {balance.asset} — متاح: {formatAmount(balance.available)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-semibold text-slate-300">
                  مبلغ التحويل
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setIdempotencyKey("");
                      setMessage("");
                    }}
                    placeholder={loading ? "جاري تحميل الرصيد…" : `المتاح: ${formatAmount(available)} ${asset}`}
                    disabled={loading || submitting || !asset || available <= 0}
                    required
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 outline-none focus:border-cyan-400/40 disabled:opacity-50"
                  />
                  <span className="mt-2 block text-[11px] font-normal text-slate-500">
                    المتاح للتحويل: {formatAmount(available)} {asset}
                  </span>
                </label>
              </div>

              {loading && (
                <div className="mt-4 text-xs text-slate-500">جاري تحميل الأرصدة في الخلفية…</div>
              )}
              {!loading && sourceBalances.length === 0 && (
                <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-sm text-amber-100">
                  لا توجد أرصدة محملة في محفظة المصدر الحالية.
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3.5 font-bold text-[#03111c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "جاري تنفيذ التحويل…" : <><ArrowLeftRight size={17} /> تحويل داخلي</>}
              </button>
              <p className="mt-3 text-center text-[11px] leading-5 text-slate-600">
                التحديث والقيود على الرصيد تُحفظ مع سجل التحويل في معاملة واحدة. تظل بيانات الحساب محدثة عند نجاح العملية.
              </p>
            </form>
          </div>
        </main>
      </div>
    </>
  );
}
