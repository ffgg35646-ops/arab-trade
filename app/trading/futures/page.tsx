"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  BarChart3,
  ChevronDown,
  Clock3,
  Maximize2,
  RefreshCw,
  Settings2,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Coin = {
  symbol?: string;
  name?: string;
  current_price?: number;
  price_change_percentage_24h?: number | null;
  total_volume?: number;
  high_24h?: number;
  low_24h?: number;
};

type Position = {
  _id?: string;
  symbol?: string;
  side?: string;
  quantity?: number;
  entryPrice?: number;
  markPrice?: number;
  leverage?: number;
  marginMode?: string;
  margin?: number;
  pnl?: number;
  liquidationPrice?: number;
  status?: string;
};

type FuturesOrder = {
  _id?: string;
  symbol?: string;
  side?: string;
  type?: string;
  quantity?: number;
  price?: number;
  leverage?: number;
  marginMode?: string;
  reduceOnly?: boolean;
  status?: string;
  createdAt?: string;
};

type FundingPayment = {
  _id?: string;
  symbol?: string;
  fundingRate?: number;
  amount?: number;
  createdAt?: string;
};

type MarketResponse = {
  coins?: Coin[];
};

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: unknown, digits = 4) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "—";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(n);
}

function money(value: unknown) {
  const n = num(value);

  if (!n) return "0.00";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function time(value?: string) {
  if (!value) return "--:--:--";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "--:--:--";

  return d.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const chartPoints = [
  0.98, 0.985, 0.982, 0.991, 0.988, 0.997, 1.005,
  1.002, 1.011, 1.006, 1.018, 1.014, 1.023, 1.019,
  1.027, 1.021, 1.031, 1.028, 1.036, 1.032, 1.044,
  1.039, 1.048, 1.045, 1.054, 1.049, 1.058, 1.052,
  1.063, 1.059, 1.067, 1.061, 1.071, 1.068, 1.076,
  1.071, 1.081, 1.077, 1.086, 1.082, 1.091, 1.087,
  1.095, 1.091, 1.1, 1.096, 1.105, 1.102, 1.11,
];

function MiniChart({ price }: { price: number }) {
  const points = chartPoints
    .map((v, i) => {
      const x = (i / (chartPoints.length - 1)) * 100;
      const y = 75 - (v - 0.98) * 420;
      return `${x},${Math.max(8, Math.min(88, y))}`;
    })
    .join(" ");

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden bg-[#050a13]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-1/5 border-t border-white/[0.035]" />
        <div className="absolute inset-x-0 top-2/5 border-t border-white/[0.035]" />
        <div className="absolute inset-x-0 top-3/5 border-t border-white/[0.035]" />
        <div className="absolute inset-x-0 top-4/5 border-t border-white/[0.035]" />

        <div className="absolute inset-y-0 left-1/5 border-l border-white/[0.025]" />
        <div className="absolute inset-y-0 left-2/5 border-l border-white/[0.025]" />
        <div className="absolute inset-y-0 left-3/5 border-l border-white/[0.025]" />
        <div className="absolute inset-y-0 left-4/5 border-l border-white/[0.025]" />
      </div>

      <div className="absolute left-4 top-3 z-10 flex flex-wrap items-center gap-2 text-[10px]">
        {["1m", "5m", "15m", "1h", "4h", "1D"].map((item, index) => (
          <button
            key={item}
            className={`rounded-md px-2 py-1 ${
              index === 2
                ? "bg-white/10 text-white"
                : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
            }`}
          >
            {item}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-white/10" />

        <button className="flex items-center gap-1 text-slate-500">
          <BarChart3 size={12} />
          المؤشرات
        </button>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-x-4 bottom-8 top-10 h-[calc(100%-72px)] w-[calc(100%-32px)]"
      >
        <defs>
          <linearGradient id="futureArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopOpacity="0.18" />
            <stop offset="100%" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon
          points={`0,100 ${points} 100,100`}
          fill="url(#futureArea)"
        />

        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.45"
          className="text-cyan-400"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[9px] text-slate-700">
        <span>10:00</span>
        <span>12:00</span>
        <span>14:00</span>
        <span>16:00</span>
        <span>18:00</span>
      </div>

      <div className="absolute right-2 top-[42%] rounded bg-cyan-500 px-2 py-1 font-mono text-[9px] font-bold text-[#001219]">
        {fmt(price, 2)}
      </div>

      <div className="absolute bottom-12 right-3 rounded border border-white/5 bg-[#07101d]/90 px-2 py-1 text-[8px] text-slate-500">
        السعر الحالي
      </div>
    </div>
  );
}

function OrderBook({
  price,
}: {
  price: number;
}) {
  const asks = [0.999, 0.998, 0.997, 0.996, 0.995].map(
    (v, i) => ({
      price: price * v,
      amount: 0.14 + i * 0.083,
      total: 1.12 + i * 0.44,
    })
  );

  const bids = [1.001, 1.002, 1.003, 1.004, 1.005].map(
    (v, i) => ({
      price: price * v,
      amount: 0.12 + i * 0.091,
      total: 0.91 + i * 0.51,
    })
  );

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold">دفتر الطلبات</h3>
          <button className="text-slate-600 hover:text-slate-300">
            <Settings2 size={14} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 text-[9px] text-slate-600">
          <span>السعر (USDT)</span>
          <span className="text-center">الكمية</span>
          <span className="text-left">الإجمالي</span>
        </div>
      </div>

      <div className="flex-1 px-3 py-2">
        {asks.reverse().map((row, i) => (
          <div
            key={`a-${i}`}
            className="relative grid grid-cols-3 py-1.5 text-[10px] font-mono"
          >
            <div
              className="absolute inset-y-0 right-0 bg-red-500/[0.035]"
              style={{ width: `${28 + i * 12}%` }}
            />
            <span className="relative text-red-400">
              {fmt(row.price, 2)}
            </span>
            <span className="relative text-center text-slate-400">
              {fmt(row.amount, 4)}
            </span>
            <span className="relative text-left text-slate-600">
              {fmt(row.total, 2)}
            </span>
          </div>
        ))}

        <div className="my-3 flex items-center gap-2 border-y border-white/[0.04] py-2">
          <span className="font-mono text-sm font-bold text-cyan-300">
            {fmt(price, 2)}
          </span>
          <span className="text-[9px] text-slate-600">≈ سعر السوق</span>
        </div>

        {bids.map((row, i) => (
          <div
            key={`b-${i}`}
            className="relative grid grid-cols-3 py-1.5 text-[10px] font-mono"
          >
            <div
              className="absolute inset-y-0 right-0 bg-emerald-500/[0.035]"
              style={{ width: `${30 + i * 11}%` }}
            />
            <span className="relative text-emerald-400">
              {fmt(row.price, 2)}
            </span>
            <span className="relative text-center text-slate-400">
              {fmt(row.amount, 4)}
            </span>
            <span className="relative text-left text-slate-600">
              {fmt(row.total, 2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentTrades({ price }: { price: number }) {
  const trades = Array.from({ length: 14 }, (_, i) => {
    const buy = i % 3 !== 0;

    return {
      price: price * (1 + ((i % 7) - 3) * 0.0003),
      amount: 0.01 + (i % 5) * 0.017,
      buy,
      time: `18:${String(52 - i).padStart(2, "0")}:${String(
        10 + i
      ).padStart(2, "0")}`,
    };
  });

  return (
    <div className="h-full">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-xs font-bold">آخر الصفقات</h3>
        <div className="mt-4 grid grid-cols-3 text-[9px] text-slate-600">
          <span>السعر</span>
          <span className="text-center">الكمية</span>
          <span className="text-left">الوقت</span>
        </div>
      </div>

      <div className="px-4 py-2">
        {trades.map((trade, i) => (
          <div
            key={i}
            className="grid grid-cols-3 py-1.5 text-[10px] font-mono"
          >
            <span
              className={
                trade.buy
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            >
              {fmt(trade.price, 2)}
            </span>

            <span className="text-center text-slate-400">
              {fmt(trade.amount, 4)}
            </span>

            <span className="text-left text-slate-600">
              {trade.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FuturesTradingPage() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<FuturesOrder[]>([]);
  const [funding, setFunding] = useState<FundingPayment[]>([]);

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<"market" | "limit">("limit");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [leverage, setLeverage] = useState("10");
  const [marginMode, setMarginMode] =
    useState<"isolated" | "cross">("isolated");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [closingId, setClosingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCoin = useMemo(
    () =>
      coins.find(
        (coin) =>
          String(coin.symbol || "").toUpperCase() ===
          symbol.replace("USDT", "")
      ) || null,
    [coins, symbol]
  );

  const currentPrice = num(selectedCoin?.current_price);

  const loadData = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const [
          marketResponse,
          positionsResponse,
          ordersResponse,
          fundingResponse,
        ] = await Promise.all([
          fetch("/api/market", {
            cache: "no-store",
          }),
          fetch("/api/futures/positions", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/futures/orders", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/futures/funding", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const market =
          (await marketResponse
            .json()
            .catch(() => ({}))) as MarketResponse;

        const nextCoins = Array.isArray(market.coins)
          ? market.coins
          : [];

        setCoins(nextCoins);

        if (
          nextCoins.length &&
          !nextCoins.some(
            (coin) =>
              String(coin.symbol || "").toUpperCase() ===
              symbol.replace("USDT", "")
          )
        ) {
          const first = String(
            nextCoins[0]?.symbol || ""
          ).toUpperCase();

          if (first) setSymbol(`${first}USDT`);
        }

        if (positionsResponse.ok) {
          const json = await positionsResponse.json();
          setPositions(
            Array.isArray(json?.positions)
              ? json.positions
              : []
          );
        }

        if (ordersResponse.ok) {
          const json = await ordersResponse.json();
          setOrders(
            Array.isArray(json?.orders)
              ? json.orders
              : []
          );
        }

        if (fundingResponse.ok) {
          const json = await fundingResponse.json();
          setFunding(
            Array.isArray(json?.payments)
              ? json.payments
              : []
          );
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "تعذر تحميل بيانات العقود."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [symbol]
  );

  useEffect(() => {
    void loadData();

    const timer = window.setInterval(() => {
      void loadData(true);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (currentPrice > 0 && !price) {
      setPrice(String(currentPrice));
    }
  }, [currentPrice, price]);

  async function submitOrder() {
    const qty = num(quantity);
    const lev = num(leverage);
    const entry =
      orderType === "market"
        ? currentPrice
        : num(price);

    if (!symbol) {
      setError("اختر عقدًا أولًا.");
      return;
    }

    if (qty <= 0) {
      setError("أدخل كمية صحيحة.");
      return;
    }

    if (entry <= 0) {
      setError("أدخل سعرًا صحيحًا.");
      return;
    }

    if (lev < 1 || lev > 125) {
      setError("الرافعة يجب أن تكون بين 1 و125.");
      return;
    }

    try {
      setOpening(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        "/api/futures/open",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol,
            side,
            quantity: qty,
            entryPrice: entry,
            leverage: lev,
            marginMode,
          }),
        }
      );

      const json = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || !json?.success) {
        throw new Error(
          json?.error ||
            json?.message ||
            "تعذر تنفيذ الأمر."
        );
      }

      setQuantity("");
      setSuccess(
        side === "long"
          ? "تم فتح مركز Long بنجاح."
          : "تم فتح مركز Short بنجاح."
      );

      await loadData(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذر تنفيذ الأمر."
      );
    } finally {
      setOpening(false);
    }
  }

  async function closePosition(position: Position) {
    const id = String(position._id || "");

    if (!id) return;

    const exitPrice =
      currentPrice || num(position.markPrice);

    if (exitPrice <= 0) {
      setError("سعر الإغلاق غير صالح.");
      return;
    }

    try {
      setClosingId(id);
      setError("");
      setSuccess("");

      const response = await fetch(
        "/api/futures/close",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id,
            exitPrice,
          }),
        }
      );

      const json = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || !json?.success) {
        throw new Error(
          json?.error ||
            json?.message ||
            "تعذر إغلاق المركز."
        );
      }

      setSuccess("تم إغلاق المركز بنجاح.");
      await loadData(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذر إغلاق المركز."
      );
    } finally {
      setClosingId("");
    }
  }

  const openPositions = positions.filter(
    (p) =>
      String(p.status || "").toLowerCase() === "open"
  );

  const openOrders = orders.filter(
    (o) =>
      String(o.status || "").toLowerCase() === "open"
  );

  const change = num(
    selectedCoin?.price_change_percentage_24h
  );

  const fundingRate = num(
    funding[0]?.fundingRate
  );

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <Navbar />

      <div className="pt-24">
        <div className="border-y border-white/[0.06] bg-[#07101d]">
          <div className="mx-auto flex max-w-[1800px] flex-col xl:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto px-4 py-3">
              <div className="flex min-w-fit items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/10 text-sm font-black text-orange-300">
                  ₿
                </div>

                <div>
                  <button className="flex items-center gap-1 text-sm font-black">
                    {symbol}
                    <ChevronDown size={13} />
                  </button>

                  <div className="text-[9px] text-slate-600">
                    Perpetual Futures
                  </div>
                </div>
              </div>

              <div className="h-8 w-px bg-white/[0.06]" />

              <div className="min-w-fit">
                <div className="font-mono text-lg font-bold text-emerald-400">
                  {loading
                    ? "..."
                    : fmt(currentPrice, 2)}
                </div>
                <div className="text-[9px] text-slate-600">
                  Mark Price
                </div>
              </div>

              <div className="min-w-fit">
                <div
                  className={`font-mono text-xs font-semibold ${
                    change >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {change >= 0 ? "+" : ""}
                  {fmt(change, 2)}%
                </div>
                <div className="text-[9px] text-slate-600">
                  24h Change
                </div>
              </div>

              <div className="min-w-fit">
                <div className="font-mono text-xs text-slate-300">
                  {fmt(selectedCoin?.high_24h, 2)}
                </div>
                <div className="text-[9px] text-slate-600">
                  24h High
                </div>
              </div>

              <div className="min-w-fit">
                <div className="font-mono text-xs text-slate-300">
                  {fmt(selectedCoin?.low_24h, 2)}
                </div>
                <div className="text-[9px] text-slate-600">
                  24h Low
                </div>
              </div>

              <div className="min-w-fit">
                <div className="font-mono text-xs text-slate-300">
                  {fmt(selectedCoin?.total_volume, 0)}
                </div>
                <div className="text-[9px] text-slate-600">
                  24h Volume
                </div>
              </div>

              <div className="min-w-fit">
                <div className="font-mono text-xs text-cyan-300">
                  {fundingRate
                    ? `${fmt(fundingRate * 100, 4)}%`
                    : "—"}
                </div>
                <div className="text-[9px] text-slate-600">
                  Funding Rate
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2 xl:border-r xl:border-t-0">
              <Link
                href="/futures"
                className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-slate-400 hover:bg-white/5 hover:text-white"
              >
                لوحة العقود
              </Link>

              <button
                onClick={() => void loadData(true)}
                disabled={refreshing}
                className="rounded-lg border border-white/10 p-2 text-slate-500 hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                <RefreshCw
                  size={14}
                  className={
                    refreshing ? "animate-spin" : ""
                  }
                />
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1800px] px-2 py-2 sm:px-3">
          {error ? (
            <div className="mb-2 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
              <span>{error}</span>
              <button onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          ) : null}

          {success ? (
            <div className="mb-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-xs text-emerald-300">
              {success}
            </div>
          ) : null}

          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-[#07101d]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="font-semibold text-slate-300">
                    حركة السوق
                  </span>
                  <span>TradingView</span>
                  <span>Depth</span>
                </div>

                <button className="text-slate-600 hover:text-white">
                  <Maximize2 size={14} />
                </button>
              </div>

              <div className="h-[470px]">
                <MiniChart price={currentPrice} />
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
              <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#07101d]">
                <OrderBook price={currentPrice} />
              </div>

              <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#07101d]">
                <RecentTrades price={currentPrice} />
              </div>
            </div>
          </div>

          <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.06] bg-[#07101d]">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="flex flex-wrap items-center gap-5">
                <button className="border-b-2 border-cyan-400 pb-3 text-xs font-bold text-white">
                  تداول
                </button>

                <button className="pb-3 text-xs text-slate-600 hover:text-slate-300">
                  الأوامر المفتوحة ({openOrders.length})
                </button>

                <button className="pb-3 text-xs text-slate-600 hover:text-slate-300">
                  المراكز ({openPositions.length})
                </button>

                <button className="pb-3 text-xs text-slate-600 hover:text-slate-300">
                  سجل الأوامر
                </button>
              </div>
            </div>

            <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="border-b border-white/[0.06] p-4 xl:border-b-0 xl:border-l">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setMarginMode("isolated")}
                    className={`rounded-lg px-3 py-2 text-[10px] font-bold ${
                      marginMode === "isolated"
                        ? "bg-white/10 text-white"
                        : "text-slate-600"
                    }`}
                  >
                    معزول
                  </button>

                  <button
                    onClick={() => setMarginMode("cross")}
                    className={`rounded-lg px-3 py-2 text-[10px] font-bold ${
                      marginMode === "cross"
                        ? "bg-white/10 text-white"
                        : "text-slate-600"
                    }`}
                  >
                    متقاطع
                  </button>

                  <div className="h-5 w-px bg-white/10" />

                  <div className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2">
                    <span className="text-[9px] text-slate-600">
                      الرافعة
                    </span>

                    <select
                      value={leverage}
                      onChange={(e) =>
                        setLeverage(e.target.value)
                      }
                      className="bg-transparent text-[10px] font-bold text-cyan-300 outline-none"
                    >
                      {[1, 2, 3, 5, 10, 20, 25, 50, 75, 100, 125].map(
                        (x) => (
                          <option
                            key={x}
                            value={x}
                            className="bg-[#07101d]"
                          >
                            {x}x
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <button className="mr-auto rounded-lg border border-white/10 p-2 text-slate-600 hover:text-white">
                    <Settings2 size={14} />
                  </button>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex gap-1 rounded-lg bg-[#050a13] p-1">
                        <button
                          onClick={() => setSide("long")}
                          className={`rounded-md px-5 py-2 text-[10px] font-bold ${
                            side === "long"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "text-slate-600"
                          }`}
                        >
                          شراء / Long
                        </button>

                        <button
                          onClick={() => setSide("short")}
                          className={`rounded-md px-5 py-2 text-[10px] font-bold ${
                            side === "short"
                              ? "bg-red-500/15 text-red-300"
                              : "text-slate-600"
                          }`}
                        >
                          بيع / Short
                        </button>
                      </div>
                    </div>

                    <div className="mb-3 flex gap-5 border-b border-white/[0.06]">
                      {(["limit", "market"] as const).map(
                        (type) => (
                          <button
                            key={type}
                            onClick={() =>
                              setOrderType(type)
                            }
                            className={`border-b-2 pb-3 text-[10px] font-bold ${
                              orderType === type
                                ? "border-cyan-400 text-white"
                                : "border-transparent text-slate-600"
                            }`}
                          >
                            {type === "limit"
                              ? "Limit"
                              : "Market"}
                          </button>
                        )
                      )}
                    </div>

                    {orderType === "limit" ? (
                      <div className="mb-3 rounded-lg border border-white/10 bg-[#050a13] px-3 py-3">
                        <div className="mb-1 text-[9px] text-slate-600">
                          السعر
                        </div>

                        <div className="flex items-center">
                          <input
                            value={price}
                            onChange={(e) =>
                              setPrice(e.target.value)
                            }
                            className="w-full bg-transparent font-mono text-sm text-white outline-none"
                            placeholder="0.00"
                            inputMode="decimal"
                          />

                          <span className="text-[9px] font-bold text-slate-600">
                            USDT
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-3 rounded-lg border border-white/10 bg-[#050a13] px-3 py-3">
                        <div className="mb-1 text-[9px] text-slate-600">
                          سعر السوق
                        </div>
                        <div className="font-mono text-sm font-bold text-slate-300">
                          {fmt(currentPrice, 2)} USDT
                        </div>
                      </div>
                    )}

                    <div className="mb-3 rounded-lg border border-white/10 bg-[#050a13] px-3 py-3">
                      <div className="mb-1 text-[9px] text-slate-600">
                        الكمية
                      </div>

                      <div className="flex items-center">
                        <input
                          value={quantity}
                          onChange={(e) =>
                            setQuantity(e.target.value)
                          }
                          className="w-full bg-transparent font-mono text-sm text-white outline-none"
                          placeholder="0.000000"
                          inputMode="decimal"
                        />

                        <span className="text-[9px] font-bold text-slate-600">
                          BTC
                        </span>
                      </div>
                    </div>

                    <div className="mb-4 flex items-center justify-between text-[9px] text-slate-600">
                      <span>القيمة الاسمية</span>
                      <span className="font-mono text-slate-400">
                        {money(
                          num(quantity) *
                            (orderType === "market"
                              ? currentPrice
                              : num(price))
                        )}{" "}
                        USDT
                      </span>
                    </div>

                    <button
                      onClick={() => void submitOrder()}
                      disabled={opening}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-xs font-black transition disabled:opacity-50 ${
                        side === "long"
                          ? "bg-emerald-500 text-[#00140b] hover:bg-emerald-400"
                          : "bg-red-500 text-white hover:bg-red-400"
                      }`}
                    >
                      {opening ? (
                        <>
                          <RefreshCw
                            size={14}
                            className="animate-spin"
                          />
                          جارٍ التنفيذ...
                        </>
                      ) : (
                        <>
                          <Zap size={14} />
                          {side === "long"
                            ? "فتح Long"
                            : "فتح Short"}
                        </>
                      )}
                    </button>
                  </div>

                  <div className="hidden rounded-xl border border-white/[0.05] bg-[#050a13] p-5 lg:block">
                    <div className="mb-5 text-[10px] font-bold text-slate-400">
                      معلومات العقد
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-600">
                          Mark Price
                        </span>
                        <span className="font-mono text-slate-300">
                          {fmt(currentPrice, 2)}
                        </span>
                      </div>

                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-600">
                          Index Price
                        </span>
                        <span className="font-mono text-slate-300">
                          {fmt(currentPrice, 2)}
                        </span>
                      </div>

                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-600">
                          Funding Rate
                        </span>
                        <span className="font-mono text-cyan-300">
                          {fundingRate
                            ? `${fmt(
                                fundingRate * 100,
                                4
                              )}%`
                            : "—"}
                        </span>
                      </div>

                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-600">
                          Max Leverage
                        </span>
                        <span className="font-mono text-slate-300">
                          125x
                        </span>
                      </div>

                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-600">
                          Margin Mode
                        </span>
                        <span className="text-slate-300">
                          {marginMode === "isolated"
                            ? "معزول"
                            : "متقاطع"}
                        </span>
                      </div>

                      <div className="mt-6 rounded-lg border border-cyan-500/10 bg-cyan-500/[0.03] p-3 text-[9px] leading-5 text-slate-600">
                        الرافعة المالية تضاعف حجم المركز
                        مقارنة بالهامش المستخدم. راقب سعر
                        التصفية والهامش المتاح قبل فتح مركز
                        كبير.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="border-b border-white/[0.06] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp
                      size={14}
                      className="text-emerald-400"
                    />
                    <span className="text-xs font-bold">
                      المراكز المفتوحة
                    </span>
                    <span className="rounded-md bg-white/5 px-2 py-1 text-[9px] text-slate-600">
                      {openPositions.length}
                    </span>
                  </div>
                </div>

                {openPositions.length === 0 ? (
                  <div className="flex min-h-[230px] items-center justify-center px-6 text-center">
                    <div>
                      <Clock3
                        size={25}
                        className="mx-auto text-slate-700"
                      />

                      <div className="mt-3 text-xs font-bold text-slate-500">
                        لا توجد مراكز مفتوحة
                      </div>

                      <div className="mt-2 text-[9px] leading-5 text-slate-700">
                        عند فتح مركز سيظهر هنا مع الربح والخسارة
                        وسعر التصفية.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[650px] w-full text-right">
                      <thead>
                        <tr className="border-b border-white/[0.05] text-[9px] text-slate-700">
                          <th className="px-4 py-3">
                            العقد
                          </th>
                          <th className="px-4 py-3">
                            الاتجاه
                          </th>
                          <th className="px-4 py-3">
                            الحجم
                          </th>
                          <th className="px-4 py-3">
                            الدخول
                          </th>
                          <th className="px-4 py-3">
                            Mark
                          </th>
                          <th className="px-4 py-3">
                            PNL
                          </th>
                          <th className="px-4 py-3">
                            إجراء
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {openPositions.map((position) => {
                          const pnl = num(position.pnl);
                          const long =
                            String(position.side)
                              .toLowerCase() === "long";

                          return (
                            <tr
                              key={String(
                                position._id
                              )}
                              className="border-b border-white/[0.04] text-[10px]"
                            >
                              <td className="px-4 py-4 font-bold">
                                {position.symbol}
                              </td>

                              <td className="px-4 py-4">
                                <span
                                  className={
                                    long
                                      ? "text-emerald-400"
                                      : "text-red-400"
                                  }
                                >
                                  {long
                                    ? "Long"
                                    : "Short"}
                                </span>
                              </td>

                              <td className="px-4 py-4 font-mono text-slate-400">
                                {fmt(
                                  position.quantity,
                                  6
                                )}
                              </td>

                              <td className="px-4 py-4 font-mono text-slate-400">
                                {fmt(
                                  position.entryPrice,
                                  2
                                )}
                              </td>

                              <td className="px-4 py-4 font-mono text-slate-400">
                                {fmt(
                                  position.markPrice,
                                  2
                                )}
                              </td>

                              <td
                                className={`px-4 py-4 font-mono font-bold ${
                                  pnl >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {pnl >= 0 ? "+" : ""}
                                {money(pnl)}
                              </td>

                              <td className="px-4 py-4">
                                <button
                                  onClick={() =>
                                    void closePosition(
                                      position
                                    )
                                  }
                                  disabled={
                                    closingId ===
                                    position._id
                                  }
                                  className="rounded-lg border border-red-500/20 px-3 py-2 text-[9px] font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                >
                                  {closingId ===
                                  position._id
                                    ? "..."
                                    : "إغلاق"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-[#07101d] p-4">
              <div className="text-[9px] text-slate-600">
                المراكز المفتوحة
              </div>
              <div className="mt-2 font-mono text-xl font-bold">
                {openPositions.length}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-[#07101d] p-4">
              <div className="text-[9px] text-slate-600">
                الأوامر المفتوحة
              </div>
              <div className="mt-2 font-mono text-xl font-bold">
                {openOrders.length}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-[#07101d] p-4">
              <div className="text-[9px] text-slate-600">
                وضع الهامش
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm font-bold">
                {marginMode === "isolated"
                  ? "Isolated"
                  : "Cross"}
                <span className="text-[9px] text-cyan-400">
                  {leverage}x
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}