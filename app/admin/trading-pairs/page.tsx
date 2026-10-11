"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import { useCallback, useEffect, useState } from "react";

type Pair = {
  _id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: "TRADING" | "HALT";
  spotTradingEnabled: boolean;
  minPrice: number;
  maxPrice: number;
  tickSize: number;
  minQuantity: number;
  maxQuantity: number;
  stepSize: number;
  minNotional: number;
  pricePrecision: number;
  quantityPrecision: number;
};

export default function TradingPairsPage() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [baseAsset, setBaseAsset] = useState("");
  const [quoteAsset, setQuoteAsset] = useState("USDT");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/admin/trading-pairs", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || "تعذر تحميل الأزواج");
      }

      setPairs(json.pairs || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPair() {
    if (!baseAsset.trim() || !quoteAsset.trim()) {
      alert("حدد العملة الأساسية وعملة التسعير");
      return;
    }

    setBusy("create");

    try {
      const res = await fetch("/api/admin/trading-pairs", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseAsset,
          quoteAsset,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || "تعذر إنشاء الزوج");
      }

      setBaseAsset("");
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "حدث خطأ");
    } finally {
      setBusy("");
    }
  }

  async function updatePair(
    id: string,
    patch: Partial<Pair>
  ) {
    setBusy(id);

    try {
      const res = await fetch("/api/admin/trading-pairs", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          ...patch,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || "تعذر تحديث الزوج");
      }

      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "حدث خطأ");
    } finally {
      setBusy("");
    }
  }

  async function deletePair(id: string) {
    if (!window.confirm("هل تريد حذف زوج التداول؟")) return;

    setBusy(id);

    try {
      const res = await fetch(
        `/api/admin/trading-pairs?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || "تعذر الحذف");
      }

      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "حدث خطأ");
    } finally {
      setBusy("");
    }
  }

  const filtered = pairs.filter((pair) =>
    pair.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminPageFrame title="أزواج التداول">
      <div dir="rtl" className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-[#08111e] p-6">
          <h2 className="text-xl font-black">إضافة زوج تداول</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              value={baseAsset}
              onChange={(e) =>
                setBaseAsset(e.target.value.toUpperCase())
              }
              placeholder="العملة الأساسية مثل BTC"
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 uppercase outline-none"
            />

            <select
              value={quoteAsset}
              onChange={(e) => setQuoteAsset(e.target.value)}
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
              <option value="BNB">BNB</option>
            </select>

            <button
              disabled={busy === "create"}
              onClick={() => void createPair()}
              className="rounded-xl bg-blue-600 px-5 py-3 font-black disabled:opacity-50"
            >
              إضافة الزوج
            </button>
          </div>
        </section>

        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث مثل BTCUSDT..."
            className="flex-1 rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
          />

          <button
            onClick={() => void load()}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-5 py-3 font-bold"
          >
            تحديث
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              جاري تحميل أزواج التداول...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              لا توجد أزواج.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="border-b border-slate-800 bg-[#0c1726]">
                  <tr>
                    <th className="px-4 py-4">الزوج</th>
                    <th className="px-4 py-4">الأساسي</th>
                    <th className="px-4 py-4">التسعير</th>
                    <th className="px-4 py-4">حالة السوق</th>
                    <th className="px-4 py-4">التداول</th>
                    <th className="px-4 py-4">Tick Size</th>
                    <th className="px-4 py-4">Step Size</th>
                    <th className="px-4 py-4">الإجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((pair) => (
                    <tr
                      key={pair._id}
                      className="border-b border-slate-800/70 last:border-0"
                    >
                      <td className="px-4 py-4 font-black text-blue-400">
                        {pair.symbol}
                      </td>

                      <td className="px-4 py-4">
                        {pair.baseAsset}
                      </td>

                      <td className="px-4 py-4">
                        {pair.quoteAsset}
                      </td>

                      <td className="px-4 py-4">
                        {pair.status}
                      </td>

                      <td className="px-4 py-4">
                        <button
                          disabled={busy === pair._id}
                          onClick={() =>
                            void updatePair(pair._id, {
                              spotTradingEnabled:
                                !pair.spotTradingEnabled,
                              status:
                                !pair.spotTradingEnabled
                                  ? "TRADING"
                                  : "HALT",
                            })
                          }
                          className={`rounded-lg px-3 py-2 text-xs font-bold ${
                            pair.spotTradingEnabled
                              ? "bg-emerald-600"
                              : "bg-slate-700"
                          }`}
                        >
                          {pair.spotTradingEnabled
                            ? "مفعل"
                            : "متوقف"}
                        </button>
                      </td>

                      <td className="px-4 py-4">
                        {pair.tickSize}
                      </td>

                      <td className="px-4 py-4">
                        {pair.stepSize}
                      </td>

                      <td className="px-4 py-4">
                        <button
                          disabled={busy === pair._id}
                          onClick={() =>
                            void deletePair(pair._id)
                          }
                          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold disabled:opacity-50"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminPageFrame>
  );
}