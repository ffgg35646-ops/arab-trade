"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type Coin = {
  id?: string;
  symbol?: string;
  name?: string;
  image?: string;
  current_price?: number;
  price_change_percentage_24h?: number | null;
  total_volume?: number;
  market_cap?: number;
  sparkline_in_7d?: {
    price?: number[];
  };
};

type Balance = {
  asset?: string;
  available?: number;
  locked?: number;
  total?: number;
};

type WalletResponse = {
  success?: boolean;
  wallet?: {
    balances?: Balance[];
  };
  spot?: {
    balances?: Balance[];
  };
};

type Order = {
  _id?: string;
  symbol?: string;
  side?: string;
  type?: string;
  price?: number;
  quantity?: number;
  originalQuantity?: number;
  filledQuantity?: number;
  remainingQuantity?: number;
  fillPercent?: number;
  status?: string;
  createdAt?: string;
};

type Trade = {
  _id?: string;
  symbol?: string;
  price?: number;
  quantity?: number;
  quoteAmount?: number;
  side?: string;
  role?: string;
  createdAt?: string;
};

type BookRow = {
  price?: number;
  quantity?: number;
  amount?: number;
};

type OrderBookResponse = {
  success?: boolean;
  bids?: BookRow[];
  asks?: BookRow[];
  buy?: BookRow[];
  sell?: BookRow[];
  data?: {
    bids?: BookRow[];
    asks?: BookRow[];
  };
};

type MarketResponse = {
  coins?: Coin[];
};

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function format(value: unknown, digits = 8) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "—";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(n);
}

function timeFormat(value: unknown) {
  if (!value) return "—";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function normalizeRows(value: unknown): BookRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any) => ({
      price: num(item?.price ?? item?.[0]),
      quantity: num(
        item?.quantity ??
          item?.qty ??
          item?.[1]
      ),
      amount: num(
        item?.amount ??
          item?.total ??
          item?.[2]
      ),
    }))
    .filter((item) => item.price > 0 && item.quantity > 0);
}

function buildChartPath(values: number[], width: number, height: number) {
  if (values.length < 2) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x =
        (index / (values.length - 1)) *
        width;

      const y =
        height -
        ((value - min) / range) *
          (height - 20) -
        10;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(
        2
      )} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function ProTradePage() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [selected, setSelected] = useState<Coin | null>(null);

  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [bids, setBids] = useState<BookRow[]>([]);
  const [asks, setAsks] = useState<BookRow[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const symbol = useMemo(() => {
    const base = String(
      selected?.symbol || "BTC"
    ).toUpperCase();

    return `${base}USDT`;
  }, [selected]);

  const baseAsset = String(
    selected?.symbol || "BTC"
  ).toUpperCase();

  const lastPrice = num(selected?.current_price);

  const quoteBalance = useMemo(
    () =>
      balances.find(
        (item) =>
          String(item.asset || "").toUpperCase() ===
          "USDT"
      ),
    [balances]
  );

  const baseBalance = useMemo(
    () =>
      balances.find(
        (item) =>
          String(item.asset || "").toUpperCase() ===
          baseAsset
      ),
    [balances, baseAsset]
  );

  const openOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          String(order.status || "").toLowerCase() ===
          "open"
      ),
    [orders]
  );

  const chartValues = useMemo(() => {
    const values =
      selected?.sparkline_in_7d?.price || [];

    if (values.length > 2) {
      return values.slice(-120);
    }

    const bookValues = [
      ...bids.map((x) => num(x.price)),
      ...asks.map((x) => num(x.price)),
    ].filter(Boolean);

    return bookValues;
  }, [selected, bids, asks]);

  const chartPath = useMemo(
    () => buildChartPath(chartValues, 900, 320),
    [chartValues]
  );

  const filteredCoins = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return coins.slice(0, 30);

    return coins
      .filter((coin) => {
        const symbol = String(
          coin.symbol || ""
        ).toLowerCase();

        const name = String(
          coin.name || ""
        ).toLowerCase();

        return (
          symbol.includes(q) ||
          name.includes(q)
        );
      })
      .slice(0, 30);
  }, [coins, search]);

  const loadData = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

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
            credentials: "include",
            cache: "no-store",
          }),

          fetch(
            `/api/orders?symbol=${encodeURIComponent(
              symbol
            )}&limit=100`,
            {
              credentials: "include",
              cache: "no-store",
            }
          ),

          fetch(
            `/api/orderbook?symbol=${encodeURIComponent(
              symbol
            )}&limit=40`,
            {
              cache: "no-store",
            }
          ),

          fetch(
            `/api/trades?symbol=${encodeURIComponent(
              symbol
            )}&limit=40`,
            {
              credentials: "include",
              cache: "no-store",
            }
          ),
        ]);

        if (marketRes.ok) {
          const json =
            (await marketRes.json()) as MarketResponse;

          const nextCoins = Array.isArray(json.coins)
            ? json.coins
            : [];

          setCoins(nextCoins);

          if (!selected && nextCoins.length) {
            setSelected(nextCoins[0]);
          }
        }

        if (walletRes.ok) {
          const json =
            (await walletRes.json()) as WalletResponse;

          setBalances(
            json?.spot?.balances ??
              json?.wallet?.balances ??
              []
          );
        }

        if (ordersRes.ok) {
          const json =
            await ordersRes.json();

          setOrders(
            Array.isArray(json?.orders)
              ? json.orders
              : []
          );
        }

        if (bookRes.ok) {
          const json =
            (await bookRes.json()) as OrderBookResponse;

          setBids(
            normalizeRows(
              json.bids ??
                json.buy ??
                json.data?.bids ??
                []
            )
          );

          setAsks(
            normalizeRows(
              json.asks ??
                json.sell ??
                json.data?.asks ??
                []
            )
          );
        }

        if (tradesRes.ok) {
          const json =
            await tradesRes.json();

          setTrades(
            Array.isArray(json?.trades)
              ? json.trades
              : []
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "تعذر تحميل بيانات التداول."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selected, symbol]
  );

  useEffect(() => {
    void loadData();

    const timer = window.setInterval(() => {
      void loadData(true);
    }, 5000);

    return () =>
      window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (lastPrice > 0) {
      setPrice(String(lastPrice));
    }
  }, [selected?.id, lastPrice]);

  async function createOrder() {
    const orderPrice = Number(price);
    const orderQuantity = Number(quantity);

    if (
      !Number.isFinite(orderPrice) ||
      orderPrice <= 0
    ) {
      setError("أدخل سعرًا صحيحًا.");
      return;
    }

    if (
      !Number.isFinite(orderQuantity) ||
      orderQuantity <= 0
    ) {
      setError("أدخل كمية صحيحة.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setMessage("");

      const response = await fetch(
        "/api/orders",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol,
            side,
            type: "limit",
            price: orderPrice,
            quantity: orderQuantity,
          }),
        }
      );

      const json =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        !json?.success
      ) {
        throw new Error(
          json?.message ||
            json?.error ||
            "تعذر إنشاء الأمر."
        );
      }

      setMessage(
        json?.message ||
          "تم إرسال الأمر بنجاح."
      );

      setQuantity("");

      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "تعذر إنشاء الأمر."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrder(order: Order) {
    const id = String(order._id || "");

    if (!id) return;

    try {
      setCancellingId(id);
      setError("");
      setMessage("");

      const response = await fetch(
        "/api/orders/cancel",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({ id }),
        }
      );

      const json =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        !json?.success
      ) {
        throw new Error(
          json?.message ||
            json?.error ||
            "تعذر إلغاء الأمر."
        );
      }

      setMessage(
        "تم إلغاء الأمر وإرجاع الرصيد المتبقي."
      );

      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "تعذر إلغاء الأمر."
      );
    } finally {
      setCancellingId("");
    }
  }

  const estimatedValue =
    num(price) * num(quantity);

  const change24h =
    num(
      selected?.price_change_percentage_24h
    );

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <Navbar />

      <div className="mx-auto max-w-[1900px] px-2 py-2 md:px-4">

        {/* Top terminal header */}
        <div className="mb-2 overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">

          <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">

            <div className="flex min-w-0 items-center gap-4">

              <div className="flex items-center gap-3">
                {selected?.image ? (
                  <img
                    src={selected.image}
                    alt=""
                    className="h-9 w-9 rounded-full"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 text-xs font-black text-cyan-300">
                    {baseAsset.slice(0, 1)}
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black">
                      {baseAsset}/USDT
                    </h1>

                    <ChevronDown
                      size={14}
                      className="text-slate-600"
                    />
                  </div>

                  <div className="text-[9px] text-slate-600">
                    السوق الفوري
                  </div>
                </div>
              </div>

              <div className="hidden h-8 w-px bg-white/10 md:block" />

              <div className="hidden gap-7 md:flex">

                <div>
                  <div className="text-[9px] text-slate-600">
                    السعر الأخير
                  </div>
                  <div className="font-mono text-sm font-bold text-white">
                    {format(lastPrice)}
                  </div>
                </div>

                <div>
                  <div className="text-[9px] text-slate-600">
                    التغيير 24 ساعة
                  </div>
                  <div
                    className={`font-mono text-sm font-bold ${
                      change24h >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {change24h >= 0 ? "+" : ""}
                    {format(change24h, 2)}%
                  </div>
                </div>

                <div>
                  <div className="text-[9px] text-slate-600">
                    حجم التداول
                  </div>
                  <div className="font-mono text-sm text-slate-300">
                    {format(
                      selected?.total_volume,
                      2
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="flex items-center gap-2">

              <Link
                href="/dashboard/orders"
                className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white"
              >
                أوامري
              </Link>

              <button
                type="button"
                onClick={() =>
                  void loadData(true)
                }
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <RefreshCw
                  size={13}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />
                تحديث
              </button>

            </div>
          </div>

          {/* Markets strip */}
          <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">

            <div className="relative hidden min-w-[180px] md:block">
              <Search
                size={13}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600"
              />

              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="بحث عن زوج..."
                className="h-8 w-full rounded-lg border border-white/10 bg-[#050a13] pr-9 pl-3 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-cyan-400/30"
              />
            </div>

            {filteredCoins.map((coin) => {
              const coinSymbol =
                String(
                  coin.symbol || ""
                ).toUpperCase();

              const active =
                selected?.id === coin.id;

              const change =
                num(
                  coin.price_change_percentage_24h
                );

              return (
                <button
                  key={
                    coin.id ||
                    coinSymbol
                  }
                  type="button"
                  onClick={() =>
                    setSelected(coin)
                  }
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] transition ${
                    active
                      ? "bg-blue-500/10 text-cyan-300"
                      : "text-slate-500 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="font-bold">
                    {coinSymbol}/USDT
                  </span>

                  <span
                    className={
                      change >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {change >= 0 ? "+" : ""}
                    {format(change, 1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-2.5 text-[10px] text-red-300">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}

        {message ? (
          <div className="mb-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-2.5 text-[10px] text-emerald-300">
            {message}
          </div>
        ) : null}

        {/* Main trading terminal */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">

          <div className="grid min-h-[760px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px_330px]">

            {/* Center */}
            <section className="min-w-0 border-b border-white/10 xl:border-b-0 xl:border-l">

              {/* Chart header */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">

                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-cyan-300">
                    حركة السوق
                  </span>

                  <span className="text-[9px] text-slate-600">
                    1س
                  </span>
                  <span className="text-[9px] text-slate-600">
                    4س
                  </span>
                  <span className="text-[9px] text-slate-600">
                    1ي
                  </span>
                  <span className="text-[9px] text-slate-600">
                    7ي
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[9px] text-slate-600">
                  <BarChart3 size={13} />
                  بيانات السوق الحالية
                </div>
              </div>

              {/* Real market chart */}
              <div className="relative h-[400px] overflow-hidden border-b border-white/10 bg-[#050a13]">

                <div className="absolute inset-0 opacity-[0.035]">
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                      backgroundSize:
                        "80px 60px",
                    }}
                  />
                </div>

                {chartPath ? (
                  <svg
                    viewBox="0 0 900 320"
                    preserveAspectRatio="none"
                    className="absolute inset-x-5 bottom-8 h-[300px] w-[calc(100%-40px)]"
                  >
                    <defs>
                      <linearGradient
                        id="chartFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#22d3ee"
                          stopOpacity="0.18"
                        />
                        <stop
                          offset="100%"
                          stopColor="#22d3ee"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>

                    <path
                      d={`${chartPath} L 900 320 L 0 320 Z`}
                      fill="url(#chartFill)"
                    />

                    <path
                      d={chartPath}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-700">
                    لا توجد بيانات متاحة حاليًا.
                  </div>
                )}

                <div className="absolute left-4 top-4">
                  <div className="font-mono text-lg font-black text-cyan-300">
                    {format(lastPrice)}
                  </div>

                  <div className="mt-1 text-[9px] text-slate-600">
                    {baseAsset}/USDT
                  </div>
                </div>

                <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[8px] text-slate-700">
                  <span>7 أيام</span>
                  <span>السعر</span>
                </div>
              </div>

              {/* Order panel */}
              <div className="border-b border-white/10">

                <div className="flex items-center gap-6 border-b border-white/10 px-4 py-3">

                  <span className="border-b-2 border-cyan-400 pb-3 text-[10px] font-bold text-cyan-300">
                    الأوامر المفتوحة
                    <span className="mr-2 text-slate-600">
                      {openOrders.length}
                    </span>
                  </span>

                  <Link
                    href="/dashboard/orders/history"
                    className="text-[10px] text-slate-600 hover:text-white"
                  >
                    سجل الأوامر
                  </Link>

                  <Link
                    href="/dashboard/trades"
                    className="text-[10px] text-slate-600 hover:text-white"
                  >
                    الصفقات
                  </Link>
                </div>

                {openOrders.length === 0 ? (
                  <div className="px-5 py-12 text-center text-[10px] text-slate-700">
                    لا توجد أوامر مفتوحة لهذا الزوج.
                  </div>
                ) : (
                  <div className="max-h-[240px] overflow-auto">
                    <table className="min-w-[850px] w-full text-right">
                      <thead>
                        <tr className="border-b border-white/5 text-[9px] text-slate-600">
                          <th className="px-4 py-3">
                            الزوج
                          </th>
                          <th className="px-4 py-3">
                            الجانب
                          </th>
                          <th className="px-4 py-3">
                            السعر
                          </th>
                          <th className="px-4 py-3">
                            الأصلي
                          </th>
                          <th className="px-4 py-3">
                            المنفذ
                          </th>
                          <th className="px-4 py-3">
                            المتبقي
                          </th>
                          <th className="px-4 py-3">
                            الوقت
                          </th>
                          <th className="px-4 py-3">
                            —
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {openOrders.map((order) => {
                          const id =
                            String(
                              order._id || ""
                            );

                          const isBuy =
                            String(
                              order.side
                            ).toLowerCase() ===
                            "buy";

                          return (
                            <tr
                              key={id}
                              className="border-b border-white/[0.04]"
                            >
                              <td className="px-4 py-3 font-mono text-[9px] text-slate-400">
                                {order.symbol}
                              </td>

                              <td
                                className={`px-4 py-3 text-[9px] font-bold ${
                                  isBuy
                                    ? "text-emerald-300"
                                    : "text-red-300"
                                }`}
                              >
                                {isBuy
                                  ? "شراء"
                                  : "بيع"}
                              </td>

                              <td className="px-4 py-3 font-mono text-[9px] text-slate-300">
                                {format(order.price)}
                              </td>

                              <td className="px-4 py-3 font-mono text-[9px] text-slate-400">
                                {format(
                                  order.originalQuantity ??
                                    order.quantity
                                )}
                              </td>

                              <td className="px-4 py-3 font-mono text-[9px] text-slate-400">
                                {format(
                                  order.filledQuantity
                                )}
                              </td>

                              <td className="px-4 py-3 font-mono text-[9px] text-slate-400">
                                {format(
                                  order.remainingQuantity ??
                                    order.quantity
                                )}
                              </td>

                              <td className="px-4 py-3 text-[8px] text-slate-600">
                                {timeFormat(
                                  order.createdAt
                                )}
                              </td>

                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void cancelOrder(
                                      order
                                    )
                                  }
                                  disabled={
                                    cancellingId ===
                                    id
                                  }
                                  className="rounded-md border border-red-500/20 px-2 py-1 text-[8px] text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                >
                                  {cancellingId ===
                                  id
                                    ? "..."
                                    : "إلغاء"}
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
            </section>

            {/* Order book + trades */}
            <aside className="border-b border-white/10 xl:border-b-0 xl:border-l">

              <div className="border-b border-white/10 px-4 py-3">
                <div className="text-xs font-black">
                  دفتر الأوامر
                </div>

                <div className="mt-1 text-[8px] text-slate-700">
                  Order Book · {symbol}
                </div>
              </div>

              <div className="grid grid-cols-3 px-4 py-2 text-[8px] text-slate-700">
                <span>السعر (USDT)</span>
                <span>الكمية</span>
                <span>القيمة</span>
              </div>

              {/* Asks */}
              <div className="h-[265px] overflow-hidden px-3">

                {asks.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[9px] text-slate-700">
                    لا توجد عروض بيع.
                  </div>
                ) : (
                  asks
                    .slice()
                    .reverse()
                    .slice(0, 14)
                    .map((row, index) => (
                      <div
                        key={`ask-${row.price}-${index}`}
                        className="grid grid-cols-3 py-[5px] text-[9px]"
                      >
                        <span className="font-mono text-red-400">
                          {format(row.price)}
                        </span>

                        <span className="font-mono text-slate-400">
                          {format(row.quantity)}
                        </span>

                        <span className="font-mono text-slate-600">
                          {format(
                            row.amount ||
                              num(row.price) *
                                num(row.quantity)
                          )}
                        </span>
                      </div>
                    ))
                )}
              </div>

              {/* Current price */}
              <div className="border-y border-white/10 bg-[#050a13] px-4 py-4">

                <div
                  className={`font-mono text-xl font-black ${
                    change24h >= 0
                      ? "text-emerald-300"
                      : "text-red-300"
                  }`}
                >
                  {format(lastPrice)}
                </div>

                <div className="mt-1 text-[8px] text-slate-700">
                  آخر سعر
                </div>
              </div>

              {/* Bids */}
              <div className="h-[265px] overflow-hidden px-3">

                {bids.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[9px] text-slate-700">
                    لا توجد طلبات شراء.
                  </div>
                ) : (
                  bids
                    .slice(0, 14)
                    .map((row, index) => (
                      <div
                        key={`bid-${row.price}-${index}`}
                        className="grid grid-cols-3 py-[5px] text-[9px]"
                      >
                        <span className="font-mono text-emerald-400">
                          {format(row.price)}
                        </span>

                        <span className="font-mono text-slate-400">
                          {format(row.quantity)}
                        </span>

                        <span className="font-mono text-slate-600">
                          {format(
                            row.amount ||
                              num(row.price) *
                                num(row.quantity)
                          )}
                        </span>
                      </div>
                    ))
                )}
              </div>

              {/* Recent trades */}
              <div className="border-t border-white/10">

                <div className="border-b border-white/10 px-4 py-3 text-xs font-black">
                  الصفقات الأخيرة
                </div>

                <div className="grid grid-cols-4 px-4 py-2 text-[8px] text-slate-700">
                  <span>السعر</span>
                  <span>الكمية</span>
                  <span>القيمة</span>
                  <span>الوقت</span>
                </div>

                <div className="max-h-[230px] overflow-auto px-3 pb-3">
                  {trades.length === 0 ? (
                    <div className="py-10 text-center text-[9px] text-slate-700">
                      لا توجد صفقات منفذة.
                    </div>
                  ) : (
                    trades.map((trade, index) => {
                      const isBuy =
                        String(
                          trade.side ||
                            (
                              trade.role ===
                              "buyer"
                                ? "buy"
                                : "sell"
                            )
                        ).toLowerCase() ===
                        "buy";

                      return (
                        <div
                          key={
                            String(
                              trade._id ||
                                index
                            )
                          }
                          className="grid grid-cols-4 py-1.5 text-[8px]"
                        >
                          <span
                            className={`font-mono ${
                              isBuy
                                ? "text-emerald-300"
                                : "text-red-300"
                            }`}
                          >
                            {format(
                              trade.price
                            )}
                          </span>

                          <span className="font-mono text-slate-400">
                            {format(
                              trade.quantity
                            )}
                          </span>

                          <span className="font-mono text-slate-600">
                            {format(
                              trade.quoteAmount ??
                                num(
                                  trade.price
                                ) *
                                  num(
                                    trade.quantity
                                  )
                            )}
                          </span>

                          <span className="text-slate-700">
                            {timeFormat(
                              trade.createdAt
                            )}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>

            {/* Buy / Sell */}
            <aside className="bg-[#06101c]">

              <div className="border-b border-white/10 px-4 py-3">
                <div className="text-xs font-black">
                  تنفيذ الأمر
                </div>

                <div className="mt-1 text-[8px] text-slate-700">
                  {symbol}
                </div>
              </div>

              <div className="p-4">

                {/* Buy/Sell */}
                <div className="mb-5 grid grid-cols-2 rounded-xl bg-[#050a13] p-1">

                  <button
                    type="button"
                    onClick={() =>
                      setSide("buy")
                    }
                    className={`rounded-lg py-3 text-[11px] font-black ${
                      side === "buy"
                        ? "bg-emerald-500 text-black"
                        : "text-slate-600 hover:text-white"
                    }`}
                  >
                    شراء
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSide("sell")
                    }
                    className={`rounded-lg py-3 text-[11px] font-black ${
                      side === "sell"
                        ? "bg-red-500 text-white"
                        : "text-slate-600 hover:text-white"
                    }`}
                  >
                    بيع
                  </button>
                </div>

                {/* Available */}
                <div className="mb-5 rounded-xl border border-white/10 bg-[#050a13] p-3">

                  <div className="flex items-center gap-2 text-[9px] text-slate-600">
                    <Wallet size={13} />
                    الرصيد المتاح
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      USDT
                    </span>

                    <span className="font-mono text-[10px] text-slate-300">
                      {format(
                        quoteBalance?.available
                      )}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      {baseAsset}
                    </span>

                    <span className="font-mono text-[10px] text-slate-300">
                      {format(
                        baseBalance?.available
                      )}
                    </span>
                  </div>
                </div>

                {/* Limit */}
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[9px] text-slate-500">
                      نوع الأمر
                    </span>

                    <span className="rounded-md bg-blue-500/10 px-2 py-1 text-[8px] text-cyan-300">
                      Limit
                    </span>
                  </div>
                </div>

                {/* Price */}
                <label className="mb-4 block">
                  <span className="mb-1.5 block text-[9px] text-slate-500">
                    السعر
                  </span>

                  <div className="relative">
                    <input
                      value={price}
                      onChange={(e) =>
                        setPrice(
                          e.target.value
                        )
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 pl-14 font-mono text-xs text-white outline-none placeholder:text-slate-800 focus:border-cyan-400/30"
                    />

                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] text-slate-600">
                      USDT
                    </span>
                  </div>
                </label>

                {/* Quantity */}
                <label className="mb-3 block">
                  <span className="mb-1.5 block text-[9px] text-slate-500">
                    الكمية
                  </span>

                  <div className="relative">
                    <input
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(
                          e.target.value
                        )
                      }
                      inputMode="decimal"
                      placeholder="0.00000000"
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#050a13] px-3 pl-14 font-mono text-xs text-white outline-none placeholder:text-slate-800 focus:border-cyan-400/30"
                    />

                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] text-slate-600">
                      {baseAsset}
                    </span>
                  </div>
                </label>

                {/* Percent buttons */}
                <div className="mb-4 grid grid-cols-4 gap-1.5">

                  {[25, 50, 75, 100].map(
                    (percent) => (
                      <button
                        key={percent}
                        type="button"
                        onClick={() => {
                          const balance =
                            side === "buy"
                              ? num(
                                  quoteBalance?.available
                                )
                              : num(
                                  baseBalance?.available
                                );

                          if (
                            side === "buy" &&
                            num(price) > 0
                          ) {
                            setQuantity(
                              String(
                                (balance *
                                  (percent /
                                    100)) /
                                  num(price)
                              )
                            );
                          } else if (
                            side === "sell"
                          ) {
                            setQuantity(
                              String(
                                balance *
                                  (percent /
                                    100)
                              )
                            );
                          }
                        }}
                        className="rounded-lg border border-white/10 py-2 text-[8px] text-slate-500 hover:bg-white/5 hover:text-white"
                      >
                        {percent}%
                      </button>
                    )
                  )}

                </div>

                {/* Estimated value */}
                <div className="mb-5 rounded-xl border border-white/10 bg-[#050a13] p-3">

                  <div className="flex justify-between text-[9px]">
                    <span className="text-slate-600">
                      القيمة التقديرية
                    </span>

                    <span className="font-mono text-slate-300">
                      {format(
                        estimatedValue
                      )}{" "}
                      USDT
                    </span>
                  </div>

                  <div className="mt-2 flex justify-between text-[9px]">
                    <span className="text-slate-600">
                      النوع
                    </span>

                    <span className="text-slate-400">
                      أمر محدد
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void createOrder()
                  }
                  disabled={
                    submitting ||
                    loading
                  }
                  className={`w-full rounded-xl py-3.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    side === "buy"
                      ? "bg-emerald-500 text-black hover:bg-emerald-400"
                      : "bg-red-500 text-white hover:bg-red-400"
                  }`}
                >
                  {submitting
                    ? "جارٍ إرسال الأمر..."
                    : side === "buy"
                      ? `شراء ${baseAsset}`
                      : `بيع ${baseAsset}`}
                </button>

                <div className="mt-3 text-center text-[8px] leading-5 text-slate-700">
                  سيتم قفل الرصيد المطلوب تلقائيًا عند
                  إنشاء الأمر، ويقوم محرك المطابقة
                  بتنفيذ الأمر عند توفر أمر مقابل.
                </div>

              </div>
            </aside>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}