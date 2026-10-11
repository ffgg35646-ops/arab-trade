 "use client";

import { useEffect, useMemo, useState } from "react";

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
      <div className="flex h-full items-center justify-center text-sm text-white/30">
        جاري التحميل...
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
      <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-white/25">
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

      <div className="absolute bottom-0 left-12 right-0 flex justify-between border-t border-white/[0.05] pt-2 text-[10px] text-white/25">
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
  const [loading, setLoading] = useState(true);
  const [openPair, setOpenPair] = useState(false);

  async function loadMarket() {
    try {
      const response = await fetch("/api/market", {
        cache: "no-store",
      });

      if (!response.ok) throw new Error();

      const data = await response.json();
      setCoins(data.coins || []);
    } catch {
      // Keep previous market data on temporary API failure.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarket();

    const timer = setInterval(loadMarket, 30000);

    return () => clearInterval(timer);
  }, []);

  const selected = useMemo(
    () => coins.find((coin) => coin.id === selectedId),
    [coins, selectedId]
  );

  const selectedPair =
    pairs.find((pair) => pair[0] === selectedId) || pairs[0];

  const tickerCoins = coins.slice(0, 30);

  return (
    <section
      dir="rtl"
      className="w-full bg-[#050a13] px-3 py-8 sm:px-5 lg:px-8"
    >
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07101d] shadow-2xl shadow-black/40">

        {/* Top Bar */}
        <div className="border-b border-white/[0.08] bg-[#07101d]">
          <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">

            <div className="relative">
              <button
                onClick={() => setOpenPair(!openPair)}
                className="flex min-w-[190px] items-center gap-3 rounded-xl border border-white/10 bg-[#07101d]/[0.035] px-4 py-2.5 text-right transition hover:bg-[#07101d]/[0.07]"
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
                  <div className="text-[10px] text-white/35">
                    {selectedPair[2]}
                  </div>
                </div>

                <span className="text-white/40">⌄</span>
              </button>

              {openPair && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#07101d] shadow-2xl">
                  <div className="border-b border-white/10 px-4 py-3 text-xs font-bold text-white/40">
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
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-right transition hover:bg-[#07101d]/[0.06]"
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
                            <div className="text-[10px] text-white/30">
                              {name}
                            </div>
                          </div>

                          {coin && (
                            <span className="text-xs text-white/60">
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
                  <div className="text-[10px] text-white/35">
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
              <span className="text-xs text-white/40">
                السوق مباشر
              </span>
            </div>
          </div>
        </div>

        {/* Mini ticker */}
        <div className="overflow-hidden border-b border-white/[0.06] bg-[#050a13]/20">
          <div className="flex min-w-max gap-2 px-3 py-2">
            {tickerCoins.map((coin) => {
              const positive =
                (coin.price_change_percentage_24h_in_currency ?? 0) >= 0;

              return (
                <button
                  key={coin.id}
                  onClick={() => setSelectedId(coin.id)}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-[#07101d]/[0.025] px-3 py-1.5 hover:bg-[#07101d]/[0.06]"
                >
                  <span className="text-[11px] font-bold text-white">
                    {coin.symbol.toUpperCase()}
                  </span>

                  <span className="text-[11px] text-white/60">
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
          <div className="min-w-0 border-l border-white/[0.07]">

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-6">
              <div className="flex items-center gap-1">
                {["1د", "5د", "15د", "1س", "4س", "1ي"].map(
                  (range, index) => (
                    <button
                      key={range}
                      className={
                        index === 3
                          ? "rounded-md bg-[#07101d]/10 px-3 py-1.5 text-[11px] font-bold text-white"
                          : "rounded-md px-3 py-1.5 text-[11px] text-white/35 hover:bg-[#07101d]/[0.05] hover:text-white"
                      }
                    >
                      {range}
                    </button>
                  )
                )}
              </div>

              <div className="text-xs text-white/30">
                حركة السوق
              </div>
            </div>

            <div className="h-[390px] p-4 sm:h-[470px] sm:p-6">
              {selected && !loading ? (
                <Candles
                  prices={selected.sparkline_in_7d?.price || []}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/30">
                  جاري تحميل السوق...
                </div>
              )}
            </div>

            {/* Stats */}
            {selected && (
              <div className="grid grid-cols-2 border-t border-white/[0.07] sm:grid-cols-4">
                <div className="border-l border-white/[0.07] p-4">
                  <div className="text-[10px] text-white/30">
                    أعلى 24 ساعة
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">
                    ${price(selected.high_24h)}
                  </div>
                </div>

                <div className="border-l border-white/[0.07] p-4">
                  <div className="text-[10px] text-white/30">
                    أقل 24 ساعة
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">
                    ${price(selected.low_24h)}
                  </div>
                </div>

                <div className="border-l border-white/[0.07] p-4">
                  <div className="text-[10px] text-white/30">
                    حجم التداول
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">
                    ${compact(selected.total_volume)}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-[10px] text-white/30">
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
          <aside className="bg-[#07101d]">
            <div className="border-b border-white/[0.07] px-5 py-4">
              <div className="text-sm font-bold text-white">
                أزواج التداول
              </div>
              <div className="mt-1 text-[10px] text-white/30">
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
                        ? "bg-[#07101d]/[0.08]"
                        : "hover:bg-[#07101d]/[0.04]"
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
                      <div className="mt-0.5 text-[10px] text-white/30">
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