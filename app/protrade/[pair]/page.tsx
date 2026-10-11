"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type WalletBalance = {
  asset: string;
  free?: number;
  available?: number;
  locked?: number;
  balance?: number;
};

type MarketCoin = {
  symbol?: string;
  name?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  high_24h?: number;
  low_24h?: number;
  total_volume?: number;
  sparkline_in_7d?: {
    price?: number[];
  };
};

type Order = {
  _id?: string;
  id?: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  quantity: number;
  originalQuantity?: number;
  filledQuantity?: number;
  remainingQuantity?: number;
  fillPercent?: number;
  status?: string;
  createdAt?: string;
};

type BookLevel = {
  price: number;
  quantity: number;
};

type Trade = {
  _id?: string;
  id?: string;
  symbol?: string;
  price: number;
  quantity: number;
  side?: "buy" | "sell";
  createdAt?: string;
  executedAt?: string;
  role?: string;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatPrice(value: number) {
  if (!value) return "0.00";

  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (value >= 1) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

function formatQty(value: number) {
  if (!value) return "0";

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}

function formatCompact(value: number) {
  if (!value) return "0";

  return value.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

function normalizeSymbol(value: string) {
  return value
    .toUpperCase()
    .replace(/[-/]/g, "_")
    .replace(/_+/g, "_");
}

function splitPair(symbol: string) {
  const clean = normalizeSymbol(symbol);

  if (clean.includes("_")) {
    const [base, quote] = clean.split("_");
    return {
      base: base || "BTC",
      quote: quote || "USDT",
    };
  }

  const quotes = ["USDT", "USDC", "BTC", "ETH", "BNB"];

  for (const quote of quotes) {
    if (clean.endsWith(quote) && clean.length > quote.length) {
      return {
        base: clean.slice(0, -quote.length),
        quote,
      };
    }
  }

  return {
    base: clean || "BTC",
    quote: "USDT",
  };
}

function getBalanceValue(balance?: WalletBalance) {
  if (!balance) return 0;

  return num(
    balance.free ??
      balance.available ??
      balance.balance ??
      0
  );
}

function extractArray<T>(payload: any, keys: string[] = []): T[] {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;

  return [];
}

function extractBook(payload: any) {
  const source = payload?.data ?? payload?.book ?? payload ?? {};

  const asks = Array.isArray(source.asks) ? source.asks : [];
  const bids = Array.isArray(source.bids) ? source.bids : [];

  const normalizeLevel = (level: any): BookLevel => {
    if (Array.isArray(level)) {
      return {
        price: num(level[0]),
        quantity: num(level[1]),
      };
    }

    return {
      price: num(level?.price),
      quantity: num(level?.quantity ?? level?.qty ?? level?.amount),
    };
  };

  return {
    asks: asks.map(normalizeLevel).filter((x: BookLevel) => x.price > 0),
    bids: bids.map(normalizeLevel).filter((x: BookLevel) => x.price > 0),
  };
}

function getOrderId(order: Order) {
  return order.id || order._id || "";
}

function timeAgo(value?: string) {
  if (!value) return "--";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function LiveChart({
  points,
  positive,
}: {
  points: number[];
  positive: boolean;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return "";

    const width = 900;
    const height = 280;
    const padding = 12;

    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;

    return points
      .map((value, index) => {
        const x =
          padding +
          (index / Math.max(points.length - 1, 1)) *
            (width - padding * 2);

        const y =
          height -
          padding -
          ((value - min) / range) *
            (height - padding * 2);

        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(
          2
        )}`;
      })
      .join(" ");
  }, [points]);

  if (!path) {
    return (
      <div className="h-[320px] flex items-center justify-center text-slate-500">
        لا توجد بيانات
      </div>
    );
  }

  return (
    <div className="relative h-[320px] w-full overflow-hidden">
      <svg
        viewBox="0 0 900 280"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={positive ? "#22d3ee" : "#ef4444"}
              stopOpacity="0.24"
            />
            <stop
              offset="100%"
              stopColor={positive ? "#22d3ee" : "#ef4444"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        <path
          d={`${path} L 888 280 L 12 280 Z`}
          fill="url(#chartFill)"
        />

        <path
          d={path}
          fill="none"
          stroke={positive ? "#22d3ee" : "#ef4444"}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,transparent_24.9%,rgba(148,163,184,.06)_25%,transparent_25.1%,transparent_49.9%,rgba(148,163,184,.06)_50%,transparent_50.1%,transparent_74.9%,rgba(148,163,184,.06)_75%,transparent_75.1%)]" />
    </div>
  );
}

function OrderBook({
  asks,
  bids,
  lastPrice,
}: {
  asks: BookLevel[];
  bids: BookLevel[];
  lastPrice: number;
}) {
  const visibleAsks = asks.slice(-10).reverse();
  const visibleBids = bids.slice(0, 10);

  const maxTotal = Math.max(
    1,
    ...visibleAsks.map((x) => x.quantity),
    ...visibleBids.map((x) => x.quantity)
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-[#07101d] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="font-bold text-white">دفتر الطلبات</h3>
      </div>

      <div className="grid grid-cols-3 px-4 py-2 text-[11px] text-slate-500">
        <span>السعر</span>
        <span className="text-center">الكمية</span>
        <span className="text-left">الإجمالي</span>
      </div>

      <div className="px-2">
        {visibleAsks.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-600">
            لا توجد عروض بيع
          </div>
        ) : (
          visibleAsks.map((level, index) => (
            <div
              key={`ask-${index}`}
              className="relative grid grid-cols-3 px-2 py-1.5 text-xs overflow-hidden"
            >
              <div
                className="absolute inset-y-0 right-0 bg-red-500/5"
                style={{
                  width: `${Math.min(
                    100,
                    (level.quantity / maxTotal) * 100
                  )}%`,
                }}
              />

              <span className="relative text-red-400">
                {formatPrice(level.price)}
              </span>

              <span className="relative text-center text-slate-300">
                {formatQty(level.quantity)}
              </span>

              <span className="relative text-left text-slate-500">
                {formatCompact(level.price * level.quantity)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-3 my-2 bg-white/[0.025] border-y border-white/5">
        <span
          className={`text-lg font-bold ${
            lastPrice ? "text-cyan-400" : "text-slate-500"
          }`}
        >
          {formatPrice(lastPrice)}
        </span>
        <span className="mr-2 text-xs text-slate-500">السعر الحالي</span>
      </div>

      <div className="px-2 pb-2">
        {visibleBids.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-600">
            لا توجد طلبات شراء
          </div>
        ) : (
          visibleBids.map((level, index) => (
            <div
              key={`bid-${index}`}
              className="relative grid grid-cols-3 px-2 py-1.5 text-xs overflow-hidden"
            >
              <div
                className="absolute inset-y-0 right-0 bg-cyan-500/5"
                style={{
                  width: `${Math.min(
                    100,
                    (level.quantity / maxTotal) * 100
                  )}%`,
                }}
              />

              <span className="relative text-cyan-400">
                {formatPrice(level.price)}
              </span>

              <span className="relative text-center text-slate-300">
                {formatQty(level.quantity)}
              </span>

              <span className="relative text-left text-slate-500">
                {formatCompact(level.price * level.quantity)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TradeForm({
  side,
  setSide,
  price,
  setPrice,
  quantity,
  setQuantity,
  base,
  quote,
  availableBase,
  availableQuote,
  submitting,
  onSubmit,
  orderType,
  setOrderType,
}: {
  side: "buy" | "sell";
  setSide: (side: "buy" | "sell") => void;
  price: string;
  setPrice: (value: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  base: string;
  quote: string;
  availableBase: number;
  availableQuote: number;
  submitting: boolean;
  onSubmit: () => void;
  orderType: "limit" | "market";
  setOrderType: (type: "limit" | "market") => void;
}) {
  const numericPrice = num(price);
  const numericQuantity = num(quantity);

  const estimated =
    orderType === "limit"
      ? numericPrice * numericQuantity
      : 0;

  const balance = side === "buy" ? availableQuote : availableBase;

  const applyPercent = (percent: number) => {
    if (side === "buy") {
      if (!numericPrice) return;

      const qty =
        (availableQuote * percent) / numericPrice;

      setQuantity(
        qty.toFixed(qty < 1 ? 8 : 6).replace(/\.?0+$/, "")
      );
    } else {
      const qty = availableBase * percent;

      setQuantity(
        qty.toFixed(qty < 1 ? 8 : 6).replace(/\.?0+$/, "")
      );
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#07101d] overflow-hidden">
      <div className="grid grid-cols-2 border-b border-white/10">
        
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setOrderType("limit")}
          className={orderType === "limit" ? "active" : ""}
        >
          Limit
        </button>
        <button
          type="button"
          onClick={() => setOrderType("market")}
          className={orderType === "market" ? "active" : ""}
        >
          Market
        </button>
      </div>
<button
          onClick={() => setSide("buy")}
          className={`py-4 text-sm font-bold transition ${
            side === "buy"
              ? "text-cyan-400 bg-cyan-400/5 border-b-2 border-cyan-400"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          شراء {base}
        </button>

        <button
          onClick={() => setSide("sell")}
          className={`py-4 text-sm font-bold transition ${
            side === "sell"
              ? "text-red-400 bg-red-400/5 border-b-2 border-red-400"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          بيع {base}
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">الرصيد المتاح</span>
          <span className="text-slate-300">
            {formatQty(balance)} {side === "buy" ? quote : base}
          </span>
        </div>

        <div>
          <label className="mb-2 block text-xs text-slate-500">
            نوع الأمر
          </label>

          <div className="h-11 rounded-xl border border-white/10 bg-black/20 flex items-center justify-between px-3">
            <span className="text-sm text-white">Limit</span>
            <span className="text-[10px] text-slate-600">
              متاح حاليًا
            </span>
          </div>
        </div>

        {orderType === "limit" && (
          <div>
            <label className="mb-2 block text-xs text-slate-500">
              السعر
            </label>

            <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-3">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
              />
              <span className="text-xs text-slate-500">{quote}</span>
            </div>
          </div>
        )}

        <div>
          <label className="mb-2 block text-xs text-slate-500">
            الكمية
          </label>

          <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-3">
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              placeholder="0.00000000"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
            />
            <span className="text-xs text-slate-500">{base}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {[0.25, 0.5, 0.75, 1].map((percent) => (
            <button
              key={percent}
              onClick={() => applyPercent(percent)}
              className="h-8 rounded-lg border border-white/10 bg-white/[0.02] text-[11px] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-400"
            >
              {percent * 100}%
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">القيمة التقريبية</span>
          <span className="text-slate-300">
            {formatPrice(estimated)} {quote}
          </span>
        </div>

        <button
          disabled={
            submitting ||
            !numericQuantity ||
            (orderType === "limit" && !numericPrice)
          }
          onClick={onSubmit}
          className={`w-full h-12 rounded-xl font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${
            side === "buy"
              ? "bg-cyan-400 text-[#041019] hover:bg-cyan-300"
              : "bg-red-500 text-white hover:bg-red-400"
          }`}
        >
          {submitting
            ? "جاري التنفيذ..."
            : side === "buy"
            ? `شراء ${base}`
            : `بيع ${base}`}
        </button>

        <p className="text-[10px] leading-5 text-slate-600 text-center">
          يتم تنفيذ أوامر Limit من خلال محرك التداول الخاص بالمنصة.
        </p>
      </div>
    </div>
  );
}

export default function ProTradePairPage() {
  const params = useParams();

  const rawPair = String(
    params?.pair || "BTC_USDT"
  );

  const { base, quote } = useMemo(
    () => splitPair(rawPair),
    [rawPair]
  );

  const symbol = `${base}_${quote}`;

  const [market, setMarket] = useState<MarketCoin | null>(null);
  const [wallet, setWallet] = useState<WalletBalance[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [asks, setAsks] = useState<BookLevel[]>([]);
  const [bids, setBids] = useState<BookLevel[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const [side, setSide] =
    useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [tradingMode, setTradingMode] =
    useState<"live" | "demo">("live");

  const [activeTab, setActiveTab] =
    useState<"orders" | "history" | "trades">(
      "orders"
    );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [
        marketRes,
        walletRes,
        ordersRes,
        bookRes,
        tradesRes,
      ] = await Promise.all([
        fetch("/api/market", {
          cache: "no-store",
        }),
        fetch("/api/wallet", {
          cache: "no-store",
        }),
        fetch(
          `/api/orders?symbol=${encodeURIComponent(
            symbol
          )}&status=open`,
          {
            cache: "no-store",
          }
        ),
        fetch(
          `/api/orderbook?symbol=${encodeURIComponent(
            symbol
          )}&limit=30`,
          {
            cache: "no-store",
          }
        ),
        fetch(
          `/api/trades?symbol=${encodeURIComponent(
            symbol
          )}&limit=30`,
          {
            cache: "no-store",
          }
        ),
      ]);

      const [
        marketJson,
        walletJson,
        ordersJson,
        bookJson,
        tradesJson,
      ] = await Promise.all([
        marketRes.json(),
        walletRes.json(),
        ordersRes.json(),
        bookRes.json(),
        tradesRes.json(),
      ]);

      if (marketRes.ok) {
        const coins = extractArray<MarketCoin>(
          marketJson,
          ["coins", "markets"]
        );

        const found = coins.find(
          (coin) =>
            String(coin.symbol || "").toUpperCase() ===
            base.toUpperCase()
        );

        if (found) {
          setMarket(found);

          if (!price && found.current_price) {
            setPrice(
              String(
                num(found.current_price).toFixed(
                  found.current_price < 1 ? 8 : 4
                )
              )
            );
          }
        }
      }

      if (walletRes.ok) {
        const balances = extractArray<WalletBalance>(
          walletJson,
          ["wallet", "spot"]
        );

        setWallet(balances);
      }

      if (ordersRes.ok) {
        setOrders(
          extractArray<Order>(ordersJson, [
            "orders",
          ])
        );
      }

      if (bookRes.ok) {
        const book = extractBook(bookJson);

        setAsks(book.asks);
        setBids(book.bids);

        const bestAsk = book.asks[0]?.price;
        const bestBid = book.bids[0]?.price;

        if (
          !price &&
          (bestAsk || bestBid)
        ) {
          setPrice(
            String(
              num(bestAsk || bestBid).toFixed(
                bestAsk && bestAsk < 1 ? 8 : 4
              )
            )
          );
        }
      }

      if (tradesRes.ok) {
        setTrades(
          extractArray<Trade>(tradesJson, [
            "trades",
          ])
        );
      }
    } catch {
      setError(
        "تعذر تحميل بيانات التداول حاليًا."
      );
    } finally {
      setLoading(false);
    }
  }, [symbol, base, price]);

  useEffect(() => {
    loadData();

    const interval = window.setInterval(
      loadData,
      5000
    );

    return () =>
      window.clearInterval(interval);
  }, [loadData]);

  const availableBase = useMemo(() => {
    const balance = wallet.find(
      (item) =>
        String(item.asset).toUpperCase() ===
        base.toUpperCase()
    );

    return getBalanceValue(balance);
  }, [wallet, base]);

  const availableQuote = useMemo(() => {
    const balance = wallet.find(
      (item) =>
        String(item.asset).toUpperCase() ===
        quote.toUpperCase()
    );

    return getBalanceValue(balance);
  }, [wallet, quote]);

  const currentPrice = useMemo(() => {
    const bestAsk = asks[0]?.price;
    const bestBid = bids[0]?.price;

    return num(
      bestAsk ||
        bestBid ||
        market?.current_price ||
        0
    );
  }, [asks, bids, market]);

  const chartPoints = useMemo(() => {
    const points =
      market?.sparkline_in_7d?.price || [];

    if (points.length >= 2) {
      const step = Math.max(
        1,
        Math.floor(points.length / 80)
      );

      return points.filter(
        (_, index) => index % step === 0
      );
    }

    const bookPrices = [
      ...bids.map((x) => x.price),
      ...asks.map((x) => x.price),
    ].filter(Boolean);

    if (bookPrices.length >= 2) {
      return bookPrices.reverse();
    }

    return [];
  }, [market, bids, asks]);

  const change24h = num(
    market?.price_change_percentage_24h
  );

  const high24h = num(
    market?.high_24h
  );

  const low24h = num(
    market?.low_24h
  );

  const volume24h = num(
    market?.total_volume
  );

  async function submitOrder() {
    const numericPrice = num(price);
    const numericQuantity = num(quantity);

    if (
      !numericPrice ||
      !numericQuantity
    ) {
      setError("أدخل السعر والكمية أولًا.");
      return;
    }

    if (side === "buy") {
      const required = numericPrice * numericQuantity;

      if (required > availableQuote) {
        setError(
          `الرصيد المتاح غير كافٍ. المتاح ${formatQty(
            availableQuote
          )} ${quote}`
        );
        return;
      }
    } else {
      if (numericQuantity > availableBase) {
        setError(
          `الرصيد المتاح غير كافٍ. المتاح ${formatQty(
            availableBase
          )} ${base}`
        );
        return;
      }
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        "/api/orders",
        {
          method: "POST",
          headers: {
        "Idempotency-Key": crypto.randomUUID(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol,
            side,
            type: orderType,
        mode: tradingMode,
            price: numericPrice,
            quantity: numericQuantity,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "فشل إنشاء الأمر."
        );
      }

      setQuantity("");

      await loadData();
    } catch (err: any) {
      setError(
        err?.message ||
          "تعذر إنشاء الأمر."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrder(order: Order) {
    const id = getOrderId(order);

    if (!id) return;

    try {
      const response = await fetch(
        "/api/orders/cancel",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "فشل إلغاء الأمر."
        );
      }

      await loadData();
    } catch (err: any) {
      setError(
        err?.message ||
          "تعذر إلغاء الأمر."
      );
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <Navbar />

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">
                  {base}/{quote}
                </h1>

                <span
                  className={`text-sm font-semibold ${
                    change24h >= 0
                      ? "text-cyan-400"
                      : "text-red-400"
                  }`}
                >
                  {change24h >= 0 ? "+" : ""}
                  {change24h.toFixed(2)}%
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-500">
                التداول الفوري · Limit
              </p>
            </div>

            <div className="hidden lg:flex items-center gap-8 text-xs">
              <div>
                <div className="text-slate-500">
                  أعلى 24س
                </div>
                <div className="mt-1 text-slate-300">
                  {formatPrice(high24h)}
                </div>
              </div>

              <div>
                <div className="text-slate-500">
                  أدنى 24س
                </div>
                <div className="mt-1 text-slate-300">
                  {formatPrice(low24h)}
                </div>
              </div>

              <div>
                <div className="text-slate-500">
                  حجم التداول
                </div>
                <div className="mt-1 text-slate-300">
                  {formatCompact(volume24h)}
                </div>
              </div>
            </div>
          </div>

          <div className="text-left">
            <div className="text-2xl font-bold text-cyan-400">
              {formatPrice(currentPrice)}
            </div>
            <div className="text-xs text-slate-500">
              {quote}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#07101d] overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-5">
                  <span className="text-sm font-bold">
                    حركة السوق
                  </span>
                  <span className="text-[11px] text-slate-600">
                    بيانات السوق
                  </span>
                </div>

                <span className="text-[10px] text-slate-600">
                  7D
                </span>
              </div>

              {loading ? (
                <div className="h-[320px] flex items-center justify-center text-slate-600">
                  جاري تحميل السوق...
                </div>
              ) : (
                <LiveChart
                  points={chartPoints}
                  positive={change24h >= 0}
                />
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <OrderBook
                asks={asks}
                bids={bids}
                lastPrice={currentPrice}
              />

              <div className="rounded-2xl border border-white/10 bg-[#07101d] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">
                      تنفيذاتي الأخيرة
                    </h3>

                    <span className="text-[10px] text-slate-600">
                      آخر 30
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 px-4 py-2 text-[11px] text-slate-500">
                  <span>السعر</span>
                  <span className="text-center">
                    الكمية
                  </span>
                  <span className="text-left">
                    الوقت
                  </span>
                </div>

                <div className="px-2">
                  {trades.length === 0 ? (
                    <div className="py-16 text-center text-xs text-slate-600">
                      لا توجد تنفيذات لحسابك
                    </div>
                  ) : (
                    trades.map((trade, index) => {
                      const isBuy =
                        trade.side === "buy";

                      return (
                        <div
                          key={
                            trade.id ||
                            trade._id ||
                            index
                          }
                          className="grid grid-cols-3 px-2 py-2 text-xs"
                        >
                          <span
                            className={
                              isBuy
                                ? "text-cyan-400"
                                : "text-red-400"
                            }
                          >
                            {formatPrice(
                              num(trade.price)
                            )}
                          </span>

                          <span className="text-center text-slate-300">
                            {formatQty(
                              num(trade.quantity)
                            )}
                          </span>

                          <span className="text-left text-slate-600">
                            {timeAgo(
                              trade.executedAt ||
                                trade.createdAt
                            )}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside>
            <TradeForm
              side={side}
              setSide={setSide}
              price={price}
              setPrice={setPrice}
              quantity={quantity}
              setQuantity={setQuantity}
              base={base}
              quote={quote}
              availableBase={availableBase}
              availableQuote={availableQuote}
              submitting={submitting}
              onSubmit={submitOrder}
              orderType={orderType}
              setOrderType={setOrderType}
            />
          </aside>
        </div>

        <section className="mt-4 rounded-2xl border border-white/10 bg-[#07101d] overflow-hidden">
          <div className="flex items-center gap-6 border-b border-white/10 px-4">
            {[
              {
                id: "orders" as const,
                label: "الأوامر المفتوحة",
              },
              {
                id: "history" as const,
                label: "سجل الأوامر",
              },
              {
                id: "trades" as const,
                label: "سجل التداول",
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() =>
                  setActiveTab(tab.id)
                }
                className={`relative py-4 text-sm font-semibold ${
                  activeTab === tab.id
                    ? "text-white"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab.label}

                {activeTab === tab.id && (
                  <span className="absolute bottom-0 right-0 left-0 h-0.5 bg-cyan-400" />
                )}
              </button>
            ))}
          </div>

          {activeTab === "orders" && (
            <div>
              {orders.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-600">
                  لا توجد أوامر مفتوحة على هذا الزوج
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-sm">
                    <thead className="border-b border-white/5 text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-3 text-right">
                          الزوج
                        </th>
                        <th className="px-5 py-3 text-right">
                          النوع
                        </th>
                        <th className="px-5 py-3 text-right">
                          الجانب
                        </th>
                        <th className="px-5 py-3 text-right">
                          السعر
                        </th>
                        <th className="px-5 py-3 text-right">
                          الكمية
                        </th>
                        <th className="px-5 py-3 text-right">
                          المنفذ
                        </th>
                        <th className="px-5 py-3 text-right">
                          الحالة
                        </th>
                        <th className="px-5 py-3 text-right">
                          إجراء
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {orders.map((order, index) => {
                        const remaining =
                          num(
                            order.remainingQuantity ??
                              order.quantity
                          );

                        const filled =
                          num(
                            order.filledQuantity
                          );

                        const total =
                          num(
                            order.originalQuantity ??
                              order.quantity
                          );

                        const percent =
                          num(
                            order.fillPercent
                          ) ||
                          (total
                            ? (filled / total) *
                              100
                            : 0);

                        return (
                          <tr
                            key={
                              getOrderId(order) ||
                              index
                            }
                            className="border-b border-white/5 last:border-0"
                          >
                            <td className="px-5 py-4 font-semibold">
                              {order.symbol}
                            </td>

                            <td className="px-5 py-4 text-slate-400">
                              Limit
                            </td>

                            <td
                              className={`px-5 py-4 font-semibold ${
                                order.side ===
                                "buy"
                                  ? "text-cyan-400"
                                  : "text-red-400"
                              }`}
                            >
                              {order.side ===
                              "buy"
                                ? "شراء"
                                : "بيع"}
                            </td>

                            <td className="px-5 py-4 text-slate-300">
                              {formatPrice(
                                num(order.price)
                              )}
                            </td>

                            <td className="px-5 py-4 text-slate-300">
                              {formatQty(
                                remaining
                              )}
                            </td>

                            <td className="px-5 py-4 text-slate-400">
                              {formatQty(
                                filled
                              )}
                              <span className="mr-1 text-slate-600">
                                (
                                {percent.toFixed(
                                  1
                                )}
                                %)
                              </span>
                            </td>

                            <td className="px-5 py-4 text-amber-400">
                              مفتوح
                            </td>

                            <td className="px-5 py-4">
                              <button
                                onClick={() =>
                                  cancelOrder(
                                    order
                                  )
                                }
                                className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                              >
                                إلغاء
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
          )}

          {activeTab === "history" && (
            <div className="p-5">
              <Link
                href="/dashboard/orders/history"
                className="block rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-cyan-400/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">
                      سجل الأوامر الكامل
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      عرض جميع أوامر الحساب السابقة
                    </div>
                  </div>

                  <span className="text-cyan-400">
                    ←
                  </span>
                </div>
              </Link>
            </div>
          )}

          {activeTab === "trades" && (
            <div className="p-5">
              <Link
                href="/dashboard/trades"
                className="block rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-cyan-400/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">
                      سجل التداول
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      عرض جميع عمليات التنفيذ الخاصة بالحساب
                    </div>
                  </div>

                  <span className="text-cyan-400">
                    ←
                  </span>
                </div>
              </Link>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}