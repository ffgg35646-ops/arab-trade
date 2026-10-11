"use client";

import { useEffect, useState } from "react";

type Balance = {
  asset: string;
  available: number;
  locked: number;
};

export default function TransferPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [asset, setAsset] = useState("");
  const [from, setFrom] = useState<"spot" | "funding">("spot");
  const [to, setTo] = useState<"spot" | "funding">("funding");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "تعذر تحميل المحافظ");
      }

      const source = data.wallets?.[from]?.balances || [];
      setBalances(source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [from]);

  const available =
    balances.find((b) => b.asset === asset)?.available || 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (from === to) {
      setError("محفظة المصدر والوجهة يجب أن تكونا مختلفتين");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset,
          amount: Number(amount),
          from,
          to,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "تعذر تنفيذ التحويل");
      }

      setMessage(data.message || "تم تنفيذ التحويل");
      setAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">التحويل الداخلي</h1>
          <p className="mt-1 text-sm text-slate-400">
            نقل الرصيد بين محفظة التداول ومحفظة التمويل داخل حسابك.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/5 p-4 text-green-300">
            {message}
          </div>
        )}

        <form
          onSubmit={submit}
          className="rounded-2xl border border-white/10 bg-[#07101d] p-6"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <select
              value={from}
              onChange={(e) =>
                setFrom(e.target.value as "spot" | "funding")
              }
              className="rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
            >
              <option value="spot">من: التداول</option>
              <option value="funding">من: التمويل</option>
            </select>

            <select
              value={to}
              onChange={(e) =>
                setTo(e.target.value as "spot" | "funding")
              }
              className="rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
            >
              <option value="funding">إلى: التمويل</option>
              <option value="spot">إلى: التداول</option>
            </select>

            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
              required
            >
              <option value="">اختر العملة</option>
              {balances.map((balance) => (
                <option key={balance.asset} value={balance.asset}>
                  {balance.asset}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`المتاح: ${loading ? "..." : available}`}
              className="rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-semibold text-black disabled:opacity-40"
          >
            {submitting ? "جاري التحويل..." : "تحويل"}
          </button>
        </form>
      </div>
    </main>
  );
}