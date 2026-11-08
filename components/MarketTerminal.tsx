 "use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Coin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_percentage_24h_in_currency?: number;
  sparkline_in_7d?: {
    price: number[];
  };
};

const pairs = [
  ["bitcoin", "BTC", "Bitcoin"],
  ["ethereum", "ETH", "Ethereum"],
  ["binancecoin", "BNB", "BNB"],
  ["solana", "SOL", "Solana"],
  ["ripple", "XRP", "XRP"],
  ["dogecoin", "DOGE", "Dogecoin"],
  ["cardano", "ADA", "Cardano"],
  ["avalanche-2", "AVAX", "Avalanche"],
  ["chainlink", "LINK", "Chainlink"],
  ["polkadot", "DOT", "Polkadot"],
  ["tron", "TRX", "TRON"],
  ["shiba-inu", "SHIB", "Shiba Inu"],
];

function price(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "--";

  if (value < 0.0001) {
    return value.toFixed(8);
  }

  if (value < 1) {
    return value.toFixed(6);
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function compact(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "--";

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function change(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "--";

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function Candles({ prices }: { prices: number[] }) {
  const candles = useMemo(() => {
    if (!prices || prices.length < 20) return [];

    const size = Math.max(3, Math.floor(prices.length / 65));
    const result = [];

    for (let i = 0; i < prices.length - size; i += size) {
      const slice = prices.slice(i, i + size);

      const open = slice[0];
      const close = slice[slice.length - 1];
      const high = Math.max(...slice);
      const low = Math.min(...slice);

      result.push({ open, close, high, low });
    }

    return result.slice(-65);
  }, [prices]);

  if (!candles.length) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg bg-[#30383b]" aria-label="منطقة الرسم البياني">
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(to bottom, transparent calc(100% - 1px), rgba(255,255,255,.07) 100%), linear-gradient(to right, transparent calc(100% - 1px), rgba(255,255,255,.045) 100%)", backgroundSize: "100% 16.66%, 12.5% 100%" }} />
      </div>
    );
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-[#aeb9bd]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-t border-white/[0.045] pt-1">
            ${price(max - (range / 6) * i)}
          </div>
        ))}
      </div>

      <div className="absolute inset-x-12 inset-y-3 flex items-stretch justify-between gap-[3px]">
        {candles.map((candle, i) => {
          const highY = ((max - candle.high) / range) * 100;
          const lowY = ((max - candle.low) / range) * 100;

          const openY = ((max - candle.open) / range) * 100;
          const closeY = ((max - candle.close) / range) * 100;

          const top = Math.min(openY, closeY);
          const height = Math.max(0.7, Math.abs(openY - closeY));

          const rising = candle.close >= candle.open;

          return (
            <div
              key={i}
              className="relative h-full flex-1"
              title={`$${price(candle.close)}`}
            >
              <div
                className={`absolute left-1/2 w-px -translate-x-1/2 ${
                  rising ? "bg-emerald-400" : "bg-red-400"
                }`}
                style={{
                  top: `${highY}%`,
                  height: `${Math.max(0.5, lowY - highY)}%`,
                }}
              />

              <div
                className={`absolute left-[15%] right-[15%] rounded-[1px] ${
                  rising ? "bg-emerald-400" : "bg-red-400"
                }`}
                style={{
                  top: `${top}%`,
                  height: `${height}%`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-0 left-12 right-0 flex justify-between border-t border-white/[0.07] pt-2 text-[10px] text-[#aeb9bd]">
        <span>7 أيام</span>
        <span>5 أيام</span>
        <span>3 أيام</span>
        <span>اليوم</span>
      </div>
    </div>
  );
}

export default function MarketTerminal() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [selectedId, setSelectedId] = useState("bitcoin");
  const [openPair, setOpenPair] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;

    async function loadMarket() {
      try {
        const response = await fetch("/api/market", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!cancelled) setCoins(Array.isArray(data.coins) ? data.coins : []);
      } catch {
        // Keep the ready page visible if market data is temporarily unavailable.
      }
    }

    const startLoading = () => {
      void loadMarket();
      refreshTimer = setInterval(() => {
        if (document.visibilityState === "visible") void loadMarket();
      }, 60000);
    };

    if (!("IntersectionObserver" in window)) {
      startLoading();
    } else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          startLoading();
        }
      }, { rootMargin: "260px 0px" });
      observer.observe(section);

      return () => {
        cancelled = true;
        observer.disconnect();
        if (refreshTimer) clearInterval(refreshTimer);
      };
    }

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, []);

  const selected = useMemo(
    () => coins.find((coin) => coin.id === selectedId),
    [coins, selectedId]
  );

  const selectedPair =
    pairs.find((pair) => pair[0] === selectedId) || pairs[0];

  const tickerCoins = coins.slice(0, 12);

  return (
    <section
      ref={sectionRef}
      dir="rtl"
      className="w-full min-w-0 overflow-hidden bg-[#e5e7e8] px-3 py-6 sm:px-5 sm:py-8 lg:px-8"
    >
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-2xl border border-white/10 bg-[#30383b] shadow-[0_16px_42px_rgba(35,45,50,0.09)]">

        {/* Top Bar */}
        <div className="border-b border-white/10 bg-[#30383b]">
          <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">

            <div className="relative">
              <button
                onClick={() => setOpenPair(!openPair)}
                className="flex min-w-[155px] max-w-full items-center gap-3 rounded-xl border border-white/10 bg-[#3b4447] px-4 py-2.5 text-right transition hover:bg-[#dfe4e5]"
              >
                {selected && (
                  <img
                    src={selected.image}
                    alt=""
                    className="h-8 w-8 rounded-full"
                  />
                )}

                <div className="flex-1">
                  <div className="text-sm font-black text-white">
                    {selectedPair[1]}/USDT
                  </div>
                  <div className="text-[10px] text-[#c0c9cc]">
                    {selectedPair[2]}
                  </div>
                </div>

                <span className="text-[#c0c9cc]">⌄</span>
              </button>

              {openPair && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#30383b] shadow-2xl">
                  <div className="border-b border-white/10 px-4 py-3 text-xs font-bold text-[#c0c9cc]">
                    اختر زوج التداول
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2">
                    {pairs.map(([id, symbol, name]) => {
                      const coin = coins.find((item) => item.id === id);

                      return (
                        <button
                          key={id}
                          onClick={() => {
                            setSelectedId(id);
                            setOpenPair(false);
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-right transition hover:bg-[#dfe4e5]"
                        >
                          {coin && (
                            <img
                              src={coin.image}
                              alt=""
                              className="h-7 w-7 rounded-full"
                            />
                          )}

                          <div className="flex-1">
                            <div className="text-sm font-bold text-white">
                              {symbol}/USDT
                            </div>
                            <div className="text-[10px] text-[#aeb9bd]">
                              {name}
                            </div>
                          </div>

                          {coin && (
                            <span className="text-xs text-[#cbd5d8]">
                              ${price(coin.current_price)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {selected && (
              <div className="flex items-center gap-5">
                <div>
                  <div className="text-[10px] text-[#c0c9cc]">
                    السعر الحالي
                  </div>
                  <div className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
                    ${price(selected.current_price)}
                  </div>
                </div>

                <div
                  className={
                    (selected.price_change_percentage_24h_in_currency ?? 0) >=
                    0
                      ? "rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-400"
                      : "rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-400"
                  }
                >
                  {change(selected.price_change_percentage_24h_in_currency)}
                </div>
              </div>
            )}

            <div className="hidden items-center gap-2 lg:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-xs text-[#c0c9cc]">
                السوق مباشر
              </span>
            </div>
          </div>
        </div>

        {/* Mini ticker */}
        <div className="overflow-x-auto overscroll-x-contain border-b border-white/[0.08] bg-[#343c3f]" style={{ scrollbarWidth: "none" }}>
          <div className="flex min-w-max gap-2 px-3 py-2">
            {tickerCoins.map((coin) => {
              const positive =
                (coin.price_change_percentage_24h_in_currency ?? 0) >= 0;

              return (
                <button
                  key={coin.id}
                  onClick={() => setSelectedId(coin.id)}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#394245] px-3 py-1.5 hover:bg-[#dfe4e5]"
                >
                  <span className="text-[11px] font-bold text-white">
                    {coin.symbol.toUpperCase()}
                  </span>

                  <span className="text-[11px] text-[#cbd5d8]">
                    ${price(coin.current_price)}
                  </span>

                  <span
                    className={
                      positive
                        ? "text-[10px] font-bold text-emerald-400"
                        : "text-[10px] font-bold text-red-400"
                    }
                  >
                    {change(coin.price_change_percentage_24h_in_currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Terminal */}
        <div className="grid lg:grid-cols-[1fr_280px]">

          {/* Chart */}
          <div className="min-w-0 border-l border-white/[0.08]">

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3 sm:px-6">
              <div className="flex items-center gap-1">
                {["1د", "5د", "15د", "1س", "4س", "1ي"].map(
                  (range, index) => (
                    <button
                      key={range}
                      className={
                        index === 3
                          ? "rounded-md bg-[#3b4447] px-3 py-1.5 text-[11px] font-bold text-white"
                          : "rounded-md px-3 py-1.5 text-[11px] text-[#c0c9cc] hover:bg-[#414a4d] hover:text-white"
                      }
                    >
                      {range}
                    </button>
                  )
                )}
              </div>

              <div className="text-xs text-[#aeb9bd]">
                حركة السوق
              </div>
            </div>

            <div className="h-[280px] min-w-0 p-2 sm:h-[390px] sm:p-4 lg:h-[470px] lg:p-6">
              <Candles prices={selected?.sparkline_in_7d?.price || []} />
            </div>

            {/* Stats */}
            {selected && (
              <div className="grid grid-cols-2 border-t border-white/[0.08] sm:grid-cols-4">
                <div className="border-l border-white/[0.08] p-4">
                  <div className="text-[10px] text-[#aeb9bd]">
                    أعلى 24 ساعة
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">
                    ${price(selected.high_24h)}
                  </div>
                </div>

                <div className="border-l border-white/[0.08] p-4">
                  <div className="text-[10px] text-[#aeb9bd]">
                    أقل 24 ساعة
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">
                    ${price(selected.low_24h)}
                  </div>
                </div>

                <div className="border-l border-white/[0.08] p-4">
                  <div className="text-[10px] text-[#aeb9bd]">
                    حجم التداول
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">
                    ${compact(selected.total_volume)}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-[10px] text-[#aeb9bd]">
                    القيمة السوقية
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">
                    ${compact(selected.market_cap)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pair Panel */}
          <aside className="bg-[#30383b]">
            <div className="border-b border-white/[0.08] px-5 py-4">
              <div className="text-sm font-bold text-white">
                أزواج التداول
              </div>
              <div className="mt-1 text-[10px] text-[#aeb9bd]">
                اختر الأصل الذي تريد متابعته
              </div>
            </div>

            <div className="p-3">
              {pairs.slice(0, 8).map(([id, symbol, name]) => {
                const coin = coins.find((item) => item.id === id);
                const active = id === selectedId;

                return (
                  <button
                    key={id}
                    onClick={() => setSelectedId(id)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-right transition ${
                      active
                        ? "bg-white/10"
                        : "hover:bg-white/[0.04]"
                    }`}
                  >
                    {coin && (
                      <img
                        src={coin.image}
                        alt=""
                        className="h-8 w-8 rounded-full"
                      />
                    )}

                    <div className="flex-1">
                      <div className="text-xs font-bold text-white">
                        {symbol}/USDT
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#aeb9bd]">
                        {name}
                      </div>
                    </div>

                    {coin && (
                      <div className="text-left">
                        <div className="text-xs font-bold text-white">
                          ${price(coin.current_price)}
                        </div>

                        <div
                          className={
                            (coin.price_change_percentage_24h_in_currency ??
                              0) >= 0
                              ? "text-[10px] text-emerald-400"
                              : "text-[10px] text-red-400"
                          }
                        >
                          {change(
                            coin.price_change_percentage_24h_in_currency
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}