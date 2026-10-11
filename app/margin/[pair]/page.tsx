"use client";
import { apiFetch } from "@/lib/frontend-api";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TVChart from "@/components/TVChart";

type Coin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume: number;
  market_cap: number;
};

type MarketResponse = {
  coins?: Coin[];
};

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "--";

  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
  }

  if (value >= 1) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 4,
    });
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "--";

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function MarginPairPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const [pair, setPair] = useState("");
  const [coins, setCoins] = useState<Coin[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMarket() {
      try {
        const response = await fetch("/api/market", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data: MarketResponse = await response.json();

        if (!active || !Array.isArray(data.coins)) return;

        setCoins(data.coins);

        const resolved = await params;

        const requested = resolved.pair
          .replace("_", "")
          .replace("/", "")
          .toUpperCase();

        const found =
          data.coins.find(
            (coin) =>
              `${coin.symbol.toUpperCase()}USDT` === requested
          ) ?? data.coins[0];

        if (found) {
          setSelectedCoin(found);
          setPair(
            `${found.symbol.toUpperCase()}_USDT`
          );
        }
      } catch {
        // بدون رسالة خطأ للمستخدم
      }
    }

    loadMarket();

    return () => {
      active = false;
    };
  }, [params]);

  const positive =
    (selectedCoin?.price_change_percentage_24h ?? 0) >= 0;

  const chartSymbol = selectedCoin
    ? `${selectedCoin.symbol.toUpperCase()}USDT`
    : "BTCUSDT";

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <Navbar />

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute -right-40 top-20 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute -left-40 bottom-20 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
              backgroundSize: "55px 55px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6">

          {/* عنوان */}
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-xs text-cyan-400">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              أسواق التداول بالهامش
            </div>

            <h1 className="text-3xl font-bold">
              التداول بالهامش
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              تداول الأصول الرقمية باستخدام نظام الهامش.
            </p>
          </div>

          {/* Terminal */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]/95 shadow-2xl">

            {/* العملات */}
            <div className="border-b border-white/10 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {coins.slice(0, 10).map((coin) => {
                  const active =
                    selectedCoin?.id === coin.id;

                  return (
                    <Link
                      key={coin.id}
                      href={`/margin/${coin.symbol.toUpperCase()}_USDT`}
                      className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                        active
                          ? "bg-blue-500/15 text-cyan-300"
                          : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      {coin.symbol.toUpperCase()}/USDT
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* معلومات السوق */}
            {selectedCoin && (
              <div className="flex flex-wrap items-center justify-between gap-5 border-b border-white/10 px-5 py-4">

                <div className="flex items-center gap-3">
                  <img
                    src={selectedCoin.image}
                    alt=""
                    className="h-10 w-10 rounded-full"
                  />

                  <div>
                    <div className="text-lg font-bold">
                      {selectedCoin.symbol.toUpperCase()}/USDT
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {selectedCoin.name}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">
                    السعر الحالي
                  </div>

                  <div className="mt-1 font-mono text-lg font-bold">
                    ${formatPrice(selectedCoin.current_price)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">
                    التغير 24 ساعة
                  </div>

                  <div
                    className={`mt-1 font-mono text-sm font-semibold ${
                      positive
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {positive ? "+" : ""}
                    {(
                      selectedCoin.price_change_percentage_24h ??
                      0
                    ).toFixed(2)}
                    %
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">
                    حجم التداول
                  </div>

                  <div className="mt-1 font-mono text-sm">
                    ${formatCompact(selectedCoin.total_volume)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">
                    القيمة السوقية
                  </div>

                  <div className="mt-1 font-mono text-sm">
                    ${formatCompact(selectedCoin.market_cap)}
                  </div>
                </div>

                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                  هامش
                </div>
              </div>
            )}

            {/* الرسم */}
            <div className="border-b border-white/10">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <span className="text-sm font-semibold">
                  حركة السوق
                </span>

                <span className="text-[11px] text-cyan-400">
                  سوق مباشر
                </span>
              </div>

              <div className="min-h-[520px]">
                <TVChart symbol={chartSymbol} />
              </div>
            </div>

            {/* منطقة الأوامر */}
            <div className="grid border-b border-white/10 md:grid-cols-2">

              <div className="border-b border-white/10 p-5 md:border-b-0 md:border-l">
                <h2 className="text-sm font-bold">
                  شراء بالهامش
                </h2>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-2 block text-[11px] text-slate-500">
                      السعر
                    </label>

                    <input
                      readOnly
                      value={
                        selectedCoin
                          ? formatPrice(
                              selectedCoin.current_price
                            )
                          : ""
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 font-mono text-sm text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] text-slate-500">
                      الكمية
                    </label>

                    <input
                      placeholder="أدخل الكمية"
                      className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/30"
                    />
                  </div>

                  <button
                    type="button"
                    className="w-full rounded-xl bg-emerald-500/15 py-3 text-sm font-bold text-emerald-400 transition hover:bg-emerald-500/20"
                  >
                    شراء
                  </button>
                </div>
              </div>

              <div className="p-5">
                <h2 className="text-sm font-bold">
                  بيع بالهامش
                </h2>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-2 block text-[11px] text-slate-500">
                      السعر
                    </label>

                    <input
                      readOnly
                      value={
                        selectedCoin
                          ? formatPrice(
                              selectedCoin.current_price
                            )
                          : ""
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 font-mono text-sm text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] text-slate-500">
                      الكمية
                    </label>

                    <input
                      placeholder="أدخل الكمية"
                      className="w-full rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/30"
                    />
                  </div>

                  <button
                    type="button"
                    className="w-full rounded-xl bg-red-500/15 py-3 text-sm font-bold text-red-400 transition hover:bg-red-500/20"
                  >
                    بيع
                  </button>
                </div>
              </div>

            </div>

            {/* معلومات */}
            <div className="grid grid-cols-2 gap-px bg-white/5 md:grid-cols-4">

              <div className="bg-[#07101d] px-5 py-4">
                <div className="text-[11px] text-slate-500">
                  نوع التداول
                </div>
                <div className="mt-1 text-sm font-semibold">
                  هامش
                </div>
              </div>

              <div className="bg-[#07101d] px-5 py-4">
                <div className="text-[11px] text-slate-500">
                  الزوج
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {pair || "--"}
                </div>
              </div>

              <div className="bg-[#07101d] px-5 py-4">
                <div className="text-[11px] text-slate-500">
                  مصدر السعر
                </div>
                <div className="mt-1 text-sm font-semibold text-cyan-400">
                  Binance
                </div>
              </div>

              <div className="bg-[#07101d] px-5 py-4">
                <div className="text-[11px] text-slate-500">
                  حالة السوق
                </div>
                <div className="mt-1 text-sm font-semibold text-emerald-400">
                  مباشر
                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/* ARABTRADE_API_LAYER: /api/assets,/api/margin/positions */