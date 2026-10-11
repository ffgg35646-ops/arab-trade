"use client";

import { useEffect, useMemo, useState } from "react";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Market = {
  symbol: string;
  name: string;
  price: number;
  change: number;
};

const markets: Market[] = [
  { symbol: "BTC/USDT", name: "Bitcoin", price: 0, change: 0 },
  { symbol: "ETH/USDT", name: "Ethereum", price: 0, change: 0 },
  { symbol: "BNB/USDT", name: "BNB", price: 0, change: 0 },
  { symbol: "SOL/USDT", name: "Solana", price: 0, change: 0 },
  { symbol: "XRP/USDT", name: "XRP", price: 0, change: 0 },
];

function CandleChart({
  candles,
}: {
  candles: Candle[];
}) {
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const update = () => {
      setWidth(
        Math.max(
          500,
          document.documentElement.clientWidth - 420
        )
      );
    };

    update();
    window.addEventListener("resize", update);

    return () =>
      window.removeEventListener("resize", update);
  }, []);

  const height = 500;
  const padding = {
    top: 24,
    right: 80,
    bottom: 35,
    left: 12,
  };

  const prices = candles.flatMap((c) => [
    c.high,
    c.low,
  ]);

  const max = Math.max(...prices, 1);
  const min = Math.min(...prices, 0);
  const range = max - min || 1;

  const chartWidth =
    width - padding.left - padding.right;

  const chartHeight =
    height - padding.top - padding.bottom;

  const candleSpace =
    chartWidth / Math.max(candles.length, 1);

  const candleWidth = Math.max(
    3,
    candleSpace * 0.62
  );

  const y = (price: number) =>
    padding.top +
    ((max - price) / range) *
      chartHeight;

  return (
    <div className="relative h-[500px] w-full overflow-hidden bg-[#050a13]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* Grid */}
        {Array.from({ length: 7 }).map(
          (_, index) => {
            const yy =
              padding.top +
              (chartHeight / 6) *
                index;

            const price =
              max -
              (range / 6) *
                index;

            return (
              <g key={index}>
                <line
                  x1={padding.left}
                  x2={
                    width -
                    padding.right
                  }
                  y1={yy}
                  y2={yy}
                  stroke="rgba(255,255,255,.055)"
                />

                <text
                  x={
                    width -
                    padding.right +
                    10
                  }
                  y={yy + 4}
                  fill="rgba(148,163,184,.7)"
                  fontSize="11"
                >
                  {Math.round(
                    price
                  ).toLocaleString()}
                </text>
              </g>
            );
          }
        )}

        {/* Candles */}
        {candles.map(
          (candle, index) => {
            const x =
              padding.left +
              index * candleSpace +
              candleSpace / 2;

            const openY = y(
              candle.open
            );

            const closeY = y(
              candle.close
            );

            const highY = y(
              candle.high
            );

            const lowY = y(
              candle.low
            );

            const bullish =
              candle.close >=
              candle.open;

            const color = bullish
              ? "#22c55e"
              : "#ef4444";

            const bodyTop =
              Math.min(
                openY,
                closeY
              );

            const bodyHeight =
              Math.max(
                2,
                Math.abs(
                  closeY - openY
                )
              );

            return (
              <g key={candle.time}>
                <line
                  x1={x}
                  x2={x}
                  y1={highY}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1"
                />

                <rect
                  x={
                    x -
                    candleWidth / 2
                  }
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                  rx="1"
                />
              </g>
            );
          }
        )}

        {/* Current price */}
        {candles.length > 0 && (
          <>
            <line
              x1={padding.left}
              x2={
                width -
                padding.right
              }
              y1={y(
                candles[
                  candles.length - 1
                ].close
              )}
              y2={y(
                candles[
                  candles.length - 1
                ].close
              )}
              stroke="rgba(34,211,238,.65)"
              strokeDasharray="5 5"
            />
          </>
        )}
      </svg>
    </div>
  );
}

export default function TradingTerminal() {
  const [selected, setSelected] =
    useState("BTC/USDT");

  const [timeframe, setTimeframe] =
    useState("1m");

  const [search, setSearch] =
    useState("");

  const [candles, setCandles] =
    useState<Candle[]>([]);

  const [price, setPrice] =
    useState<number | null>(null);

  const [change, setChange] =
    useState<number | null>(null);

  const currentMarket =
    useMemo(
      () =>
        markets.find(
          (market) =>
            market.symbol ===
            selected
        ),
      [selected]
    );

  useEffect(() => {
    let cancelled = false;

    async function loadMarket() {
      try {
        const response =
          await fetch(
            `/api/market?symbol=${encodeURIComponent(
              selected
            )}`,
            {
              cache: "no-store",
            }
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (cancelled) return;

        if (
          typeof data.price ===
          "number"
        ) {
          setPrice(data.price);
        }

        if (
          typeof data.change ===
          "number"
        ) {
          setChange(data.change);
        }

        if (
          Array.isArray(
            data.candles
          )
        ) {
          setCandles(
            data.candles
              .filter(
                (c: any) =>
                  typeof c.open ===
                    "number" &&
                  typeof c.high ===
                    "number" &&
                  typeof c.low ===
                    "number" &&
                  typeof c.close ===
                    "number"
              )
              .map(
                (c: any) => ({
                  time:
                    Number(
                      c.time ??
                        Date.now()
                    ),
                  open: c.open,
                  high: c.high,
                  low: c.low,
                  close:
                    c.close,
                })
              )
          );
        }
      } catch {
        // API errors are handled by the UI.
      }
    }

    loadMarket();

    const interval =
      window.setInterval(
        loadMarket,
        3000
      );

    return () =>
      {
        cancelled = true;
        window.clearInterval(
          interval
        );
      };
  }, [selected, timeframe]);

  const filteredMarkets =
    markets.filter((market) =>
      `${market.symbol} ${market.name}`
        .toLowerCase()
        .includes(
          search.toLowerCase()
        )
    );

  return (
    <div
      dir="rtl"
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d] shadow-2xl"
    >
      {/* Market Header */}
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">

          <div className="flex items-center gap-5">

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-white">
                  {selected}
                </span>

                <span className="rounded-md border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-[10px] text-cyan-300">
                  Spot
                </span>
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {currentMarket?.name}
              </div>
            </div>

            <div>
              <div
                className={`text-xl font-bold ${
                  change !== null &&
                  change >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {price !== null
                  ? price.toLocaleString(
                      undefined,
                      {
                        maximumFractionDigits:
                          8,
                      }
                    )
                  : "—"}
              </div>

              <div
                className={`text-xs ${
                  change !== null &&
                  change >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {change !== null
                  ? `${
                      change >= 0
                        ? "+"
                        : ""
                    }${change.toFixed(
                      2
                    )}%`
                  : "—"}
              </div>
            </div>

          </div>

          {/* Pair Selector */}
          <div className="relative">
            <input
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="بحث عن زوج..."
              className="w-52 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
            />

            {search && (
              <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#07101d] shadow-2xl">
                {filteredMarkets.map(
                  (market) => (
                    <button
                      key={
                        market.symbol
                      }
                      onClick={() => {
                        setSelected(
                          market.symbol
                        );
                        setSearch("");
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-right transition hover:bg-white/5"
                    >
                      <span className="font-semibold text-white">
                        {
                          market.symbol
                        }
                      </span>

                      <span className="text-xs text-slate-500">
                        {market.name}
                      </span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>

        </div>

        {/* Market Stats */}
        <div className="mt-5 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4 lg:grid-cols-6">

          {[
            ["24h التغير", change],
            ["24h الأعلى", null],
            ["24h الأدنى", null],
            ["حجم التداول", null],
            ["آخر سعر", price],
            ["السوق", "Spot"],
          ].map(
            ([label, value]) => (
              <div
                key={String(label)}
                className="border-r border-white/5 pr-4"
              >
                <div className="text-slate-600">
                  {label}
                </div>

                <div className="mt-1 font-semibold text-slate-300">
                  {value === null ||
                  value === undefined
                    ? "—"
                    : typeof value ===
                        "number"
                      ? value.toLocaleString()
                      : value}
                </div>
              </div>
            )
          )}

        </div>
      </div>

      {/* Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px]">

        {/* Chart */}
        <div className="min-w-0">

          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">

            <div className="flex items-center gap-1">

              {[
                "1m",
                "5m",
                "15m",
                "1H",
                "4H",
                "1D",
              ].map((item) => (
                <button
                  key={item}
                  onClick={() =>
                    setTimeframe(
                      item
                    )
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    timeframe ===
                    item
                      ? "bg-cyan-400/10 text-cyan-300"
                      : "text-slate-500 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item}
                </button>
              ))}

            </div>

            <div className="text-[10px] text-slate-600">
              {candles.length
                ? "بيانات السوق"
                : "في انتظار البيانات"}
            </div>

          </div>

          {candles.length > 0 ? (
            <CandleChart
              candles={candles}
            />
          ) : (
            <div className="flex h-[500px] items-center justify-center bg-[#050a13] text-sm text-slate-600">
              في انتظار بيانات الشموع...
            </div>
          )}

        </div>

        {/* Order Book */}
        <aside className="border-t border-white/10 lg:border-r lg:border-t-0">

          <div className="border-b border-white/10 px-4 py-4">
            <h2 className="text-sm font-bold text-white">
              دفتر الأوامر
            </h2>
          </div>

          <div className="px-4 py-4">

            <div className="grid grid-cols-3 text-[10px] text-slate-600">
              <span>السعر</span>
              <span>الكمية</span>
              <span>الإجمالي</span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-center text-xs text-slate-600">
                لا توجد بيانات أوامر متاحة حاليًا
              </div>
            </div>

          </div>

          <div className="border-y border-white/10 px-4 py-4">

            <div className="text-xs text-slate-600">
              السعر الحالي
            </div>

            <div className="mt-1 text-lg font-bold text-cyan-300">
              {price !== null
                ? price.toLocaleString()
                : "—"}
            </div>

          </div>

          <div className="px-4 py-4">

            <div className="grid grid-cols-3 text-[10px] text-slate-600">
              <span>السعر</span>
              <span>الكمية</span>
              <span>الإجمالي</span>
            </div>

            <div className="mt-3 text-center text-xs text-slate-600">
              لا توجد بيانات أوامر متاحة حاليًا
            </div>

          </div>

        </aside>
      </div>

      {/* Order Panel */}
      <div className="border-t border-white/10">

        <div className="flex border-b border-white/10">

          <button className="border-b-2 border-green-400 px-6 py-4 text-sm font-bold text-green-400">
            شراء
          </button>

          <button className="px-6 py-4 text-sm font-bold text-slate-500 hover:text-white">
            بيع
          </button>

        </div>

        <div className="grid gap-6 p-5 md:grid-cols-2">

          <div className="space-y-4">

            <div className="text-xs text-slate-500">
              الرصيد المتاح
            </div>

            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-500">
              غير متصل بالمحفظة حاليًا
            </div>

            <div className="grid grid-cols-2 gap-3">

              <input
                disabled
                placeholder="السعر"
                className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-600"
              />

              <input
                disabled
                placeholder="الكمية"
                className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-600"
              />

            </div>

            <input
              disabled
              placeholder="الإجمالي"
              className="w-full rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-600"
            />

            <button
              disabled
              className="w-full rounded-xl bg-green-500/10 py-3 text-sm font-bold text-green-400"
            >
              الشراء غير متاح حتى ربط نظام الأوامر
            </button>

          </div>

          <div className="space-y-4">

            <div className="text-xs text-slate-500">
              الرصيد المتاح
            </div>

            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-500">
              غير متصل بالمحفظة حاليًا
            </div>

            <div className="grid grid-cols-2 gap-3">

              <input
                disabled
                placeholder="السعر"
                className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-600"
              />

              <input
                disabled
                placeholder="الكمية"
                className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-600"
              />

            </div>

            <input
              disabled
              placeholder="الإجمالي"
              className="w-full rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-600"
            />

            <button
              disabled
              className="w-full rounded-xl bg-red-500/10 py-3 text-sm font-bold text-red-400"
            >
              البيع غير متاح حتى ربط نظام الأوامر
            </button>

          </div>

        </div>
      </div>

      {/* Bottom Tabs */}
      <div className="border-t border-white/10">

        <div className="flex overflow-x-auto">

          {[
            "الأوامر المفتوحة",
            "سجل الأوامر",
            "سجل التداول",
            "الأصول",
          ].map((item) => (
            <button
              key={item}
              className="whitespace-nowrap px-6 py-4 text-xs text-slate-500 hover:text-white"
            >
              {item}
            </button>
          ))}

        </div>

        <div className="border-t border-white/5 px-5 py-10 text-center text-xs text-slate-600">
          لا توجد بيانات متاحة حاليًا
        </div>

      </div>
    </div>
  );
}