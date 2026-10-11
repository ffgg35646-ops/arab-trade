"use client";

import { useEffect, useMemo, useState } from "react";

type DepositBalance = { asset: string; available: number; locked: number };
type DepositRecord = { _id?: string; id?: string; asset: string; network: string; amount: number; status: string; txHash?: string; adminNote?: string; createdAt?: string };

type Method = {
  _id: string;
  name: string;
  asset: string;
  network: string;
  address: string;
  minDeposit: number;
  minWithdrawal: number;
  enabled: boolean;
  depositEnabled?: boolean;
  withdrawalEnabled?: boolean;
};

export default function DepositPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [depositBalances, setDepositBalances] = useState<DepositBalance[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");

  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadMethods();
  }, []);

  async function loadMethods() {
    setLoading(true);
    setError("");

    try {
      const [res, balanceRes] = await Promise.all([
        fetch("/api/payment-options", { cache: "no-store" }),
        fetch("/api/deposits", { credentials: "include", cache: "no-store" }),
      ]);

      const json = await res.json();
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
        ? json.methods.filter(
            (method: Method) =>
              method.enabled !== false &&
              method.depositEnabled !== false
          )
        : [];

      setMethods(rows);

      if (rows.length > 0) {
        setSelectedId(rows[0]._id);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذر تحميل وسائل الدفع"
      );
    } finally {
      setLoading(false);
    }
  }

  const selected = useMemo(
    () =>
      methods.find(
        (method) => method._id === selectedId
      ) || null,
    [methods, selectedId]
  );

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

      if (numericAmount < selected.minDeposit) {
        throw new Error(
          `الحد الأدنى للإيداع هو ${selected.minDeposit} ${selected.asset}`
        );
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
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] p-4 text-white sm:p-6"
    >
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-black">
          إيداع
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          اختر وسيلة الدفع المفعلة من إدارة المنصة. الإيداعات الخارجية المعتمدة تضاف إلى رصيد الإيداع المنفصل.
        </p>

        <section className="mt-5 rounded-2xl border border-cyan-300/15 bg-[#08111e] p-5">
          <h2 className="text-sm font-bold text-slate-300">رصيد الإيداع المتاح</h2>
          {depositBalances.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">لا يوجد رصيد إيداع معتمد حتى الآن.</p>
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

        {loading ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-[#08111e] p-10 text-center text-slate-500">
            جاري تحميل وسائل الدفع...
          </div>
        ) : methods.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-[#08111e] p-10 text-center text-slate-500">
            لا توجد وسائل إيداع مفعلة حاليًا.
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {methods.map((method) => {
                const selectedCard =
                  method._id === selectedId;

                return (
                  <button
                    key={method._id}
                    type="button"
                    onClick={() =>
                      setSelectedId(method._id)
                    }
                    className={`rounded-2xl border p-5 text-right transition ${
                      selectedCard
                        ? "border-blue-500 bg-blue-950/20"
                        : "border-slate-800 bg-[#08111e] hover:border-blue-500/50"
                    }`}
                  >
                    <div className="text-lg font-black">
                      {method.name}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {method.asset} ·{" "}
                      {method.network}
                    </div>

                    <div className="mt-4 text-sm text-slate-400">
                      الحد الأدنى للإيداع:
                    </div>

                    <div className="mt-1 font-black">
                      {method.minDeposit}{" "}
                      {method.asset}
                    </div>
                  </button>
                );
              })}
            </div>

            {selected && (
              <form
                onSubmit={submit}
                className="mt-5 space-y-5 rounded-2xl border border-slate-800 bg-[#08111e] p-6"
              >
                <div className="rounded-xl border border-blue-900/40 bg-blue-950/10 p-5">
                  <div className="text-lg font-black">
                    {selected.name}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {selected.asset} ·{" "}
                    {selected.network}
                  </div>

                  <div className="mt-4 text-xs text-slate-500">
                    بيانات التحويل
                  </div>

                  <div className="mt-2 break-all rounded-lg bg-black/20 p-3 text-sm">
                    {selected.address ||
                      "لم يتم إعداد بيانات التحويل بعد"}
                  </div>

                  <div className="mt-4 text-xs text-slate-500">
                    الحد الأدنى للإيداع
                  </div>

                  <div className="mt-1 font-black">
                    {selected.minDeposit}{" "}
                    {selected.asset}
                  </div>
                </div>

                <input
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value)
                  }
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="مبلغ الإيداع"
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
                />

                <input
                  value={txHash}
                  onChange={(e) =>
                    setTxHash(e.target.value)
                  }
                  placeholder="TX Hash إن وجد"
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
                />

                <div className="rounded-xl border border-slate-800 p-4">
                  <label
                    htmlFor="deposit-screenshot"
                    className="mb-2 block font-bold"
                  >
                    Screenshot للتحويل
                  </label>

                  <input
                    id="deposit-screenshot"
                    type="file"
                    required
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) =>
                      setScreenshot(
                        e.target.files?.[0] || null
                      )
                    }
                    className="block w-full text-sm"
                  />

                  <p className="mt-2 text-xs text-slate-500">
                    JPG / PNG / WEBP — الحد الأقصى 8MB
                  </p>
                </div>

                <button
                  disabled={sending}
                  className="w-full rounded-xl bg-blue-600 px-5 py-4 font-black disabled:opacity-50"
                >
                  {sending
                    ? "جاري إرسال الطلب..."
                    : "إرسال طلب الإيداع"}
                </button>
              </form>
            )}
          </>
        )}

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
                  <span className={item.status === "approved" ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300" : item.status === "rejected" ? "rounded-full bg-red-400/10 px-3 py-1 text-xs font-bold text-red-300" : "rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200"}>
                    {item.status === "approved" ? "معتمد — أضيف لرصيد الإيداع" : item.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}