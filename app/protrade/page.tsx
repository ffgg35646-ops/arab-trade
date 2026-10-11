"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Clock3,
  Maximize2,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";

type Asset = {
  current_price?: number;
  price_change_percentage_24h?: number;
  total_volume?: number;
  symbol?: string;
  name?: string;
  enabled?: boolean;
  tradingEnabled?: boolean;
};

type Balance = {
  asset?: string;
  available?: number;
  locked?: number;
  total?: number;
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
  quoteAmount?: number;
  status?: string;
  createdAt?: string;
};

type BookOrder = {
  price?: number;
  quantity?: number;
  amount?: number;
  total?: number;
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

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: unknown, digits = 8) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(n);
}

function money(value: unknown) {
  return fmt(value, 2);
}

function time(value: unknown) {
  if (!value) return "—";

  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function normalizeRows(value: unknown): BookOrder[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any) => ({
      price: num(item?.price ?? item?.[0]),
      quantity: num(item?.quantity ?? item?.qty ?? item?.[1]),
      amount: num(item?.amount ?? item?.total ?? item?.[2]),
    }))
    .filter((item) => item.price > 0 && item.quantity > 0);
}

function Chart({
  trades,
  price,
}: {
  trades: Trade[];
  price: number;
}) {
  const points = useMemo(() => {
    const source = trades
      .map((t) => num(t.price))
      .filter((v) => v > 0)
      .reverse();

    if (source.length >= 2) {
      const min = Math.min(...source);
      const max = Math.max(...source);
      const range = max - min || max * 0.001 || 1;

      return source.map((v, i) => {
        const x = (i / Math.max(source.length - 1, 1)) * 1000;
        const y = 250 - ((v - min) / range) * 205;
        return `${x},${y}`;
      });
    }

    const base = price || 100;
    return Array.from({ length: 80 }, (_, i) => {
      const x = (i / 79) * 1000;
      const wave =
        Math.sin(i * 0.27) * 0.35 +
        Math.sin(i * 0.08) * 0.22 +
        Math.sin(i * 0.51) * 0.1;
      const y = 145 - wave * 80 - i * 0.25;
      return `${x},${y}`;
    });
  }, [trades, price]);

  return (
    <div className="relative h-[390px] w-full overflow-hidden bg-[#060c15]">
      <div className="absolute inset-0 opacity-30">
        {[20, 40, 60, 80].map((v) => (
          <div
            key={`h-${v}`}
            className="absolute left-0 right-0 border-t border-white/[0.06]"
            style={{ top: `${v}%` }}
          />
        ))}
        {[20, 40, 60, 80].map((v) => (
          <div
            key={`v-${v}`}
            className="absolute top-0 bottom-0 border-l border-white/[0.06]"
            style={{ left: `${v}%` }}
          />
        ))}
      </div>

      <svg
        viewBox="0 0 1000 250"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-16 h-[250px] w-full"
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopOpacity="0.22" />
            <stop offset="100%" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon
          points={`0,250 ${points.join(" ")} 1000,250`}
          fill="url(#areaFill)"
        />

        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          className="text-cyan-400"
        />
      </svg>

      <div className="absolute left-4 top-3 flex items-center gap-2 text-xs text-slate-400">
        <button className="rounded-md bg-white/[0.05] px-3 py-1.5 text-white">
          1m
        </button>
        <button className="px-2 py-1.5">5m</button>
        <button className="px-2 py-1.5">15m</button>
        <button className="px-2 py-1.5">1H</button>
        <button className="px-2 py-1.5">4H</button>
        <button className="px-2 py-1.5">1D</button>
      </div>

      <div className="absolute right-4 top-3 flex items-center gap-3 text-slate-400">
        <BarChart3 size={16} />
        <Settings2 size={16} />
        <Maximize2 size={16} />
      </div>

      <div className="absolute bottom-3 left-4 right-4 flex justify-between text-[11px] text-slate-500">
        <span>09:00</span>
        <span>12:00</span>
        <span>15:00</span>
        <span>18:00</span>
        <span>21:00</span>
      </div>
    </div>
  );
}

function OrderBook({
  asks,
  bids,
  currentPrice,
}: {
  asks: BookOrder[];
  bids: BookOrder[];
  currentPrice: number;
}) {
  const visibleAsks = [...asks]
    .sort((a, b) => num(b.price) - num(a.price))
    .slice(0, 12);

  const visibleBids = [...bids]
    .sort((a, b) => num(b.price) - num(a.price))
    .slice(0, 12);

  const maxAmount = Math.max(
    1,
    ...[...visibleAsks, ...visibleBids].map((x) =>
      num(x.amount || x.total || num(x.price) * num(x.quantity))
    )
  );

  const Row = ({
    row,
    ask,
  }: {
    row: BookOrder;
    ask?: boolean;
  }) => {
    const amount =
      num(row.amount || row.total) ||
      num(row.price) * num(row.quantity);

    const width = Math.min(100, (amount / maxAmount) * 100);

    return (
      <div className="relative grid grid-cols-3 px-3 py-[3px] text-[12px]">
        <div
          className="absolute inset-y-0 right-0 opacity-[0.08]"
          style={{ width: `${width}%` }}
        />
        <span className={ask ? "relative text-rose-400" : "relative text-emerald-400"}>
          {fmt(row.price, 4)}
        </span>
        <span className="relative text-right text-slate-300">
          {fmt(row.quantity, 6)}
        </span>
        <span className="relative text-right text-slate-500">
          {money(amount)}
        </span>
      </div>
    );
  };

  return (
    <div className="h-full bg-[#060c15]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-sm font-semibold text-white">دفتر الأوامر</h3>
        <div className="flex gap-1 text-[10px] text-slate-500">
          <span className="rounded bg-emerald-400/10 px-2 py-1 text-emerald-400">شراء</span>
          <span className="rounded bg-rose-400/10 px-2 py-1 text-rose-400">بيع</span>
        </div>
      </div>

      <div className="grid grid-cols-3 px-3 py-2 text-[10px] text-slate-500">
        <span>السعر (USDT)</span>
        <span className="text-right">الكمية</span>
        <span className="text-right">الإجمالي</span>
      </div>

      <div className="min-h-[250px]">
        {visibleAsks.length ? (
          visibleAsks.map((row, i) => <Row key={`a-${i}`} row={row} ask />)
        ) : (
          <div className="px-4 py-10 text-center text-xs text-slate-600">
            لا توجد أوامر بيع
          </div>
        )}
      </div>

      <div className="border-y border-white/[0.05] px-3 py-3">
        <div className="text-base font-semibold text-cyan-400">
          {fmt(currentPrice, 4)} <span className="text-[10px] text-slate-500">USDT</span>
        </div>
      </div>

      <div className="min-h-[250px]">
        {visibleBids.length ? (
          visibleBids.map((row, i) => <Row key={`b-${i}`} row={row} />)
        ) : (
          <div className="px-4 py-10 text-center text-xs text-slate-600">
            لا توجد أوامر شراء
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProTradePage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [asks, setAsks] = useState<BookOrder[]>([]);
  const [bids, setBids] = useState<BookOrder[]>([]);

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");

  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [tradingMode, setTradingMode] =
    useState<"demo" | "live">("demo");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"open" | "history">("open");

  const selectedAsset = useMemo(() => {
    const base = symbol.replace(/USDT$/i, "").toUpperCase();
    return assets.find(
      (a) => String(a.symbol || "").toUpperCase() === base
    );
  }, [assets, symbol]);

  const baseAsset = symbol.replace(/USDT$/i, "").toUpperCase();
  const quoteAsset = "USDT";

  const currentPrice = useMemo(() => {
    const last = trades.find((t) => num(t.price) > 0);
    if (last) return num(last.price);

    const ask = asks.find((x) => num(x.price) > 0);
    if (ask) return num(ask.price);

    return num(selectedAsset?.current_price);
  }, [trades, asks, selectedAsset]);

  const marketChange = num(selectedAsset?.price_change_percentage_24h);

  const baseBalance =
    balances.find(
      (b) => String(b.asset || "").toUpperCase() === baseAsset
    ) || {};

  const quoteBalance =
    balances.find(
      (b) => String(b.asset || "").toUpperCase() === quoteAsset
    ) || {};

  const openOrders = useMemo(
    () => orders.filter((o) => String(o.status).toLowerCase() === "open"),
    [orders]
  );

  const historyOrders = useMemo(
    () => orders.filter((o) => String(o.status).toLowerCase() !== "open"),
    [orders]
  );

  const loadAll = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setRefreshing(true);
        setError("");

        const [
          assetsResponse,
          walletResponse,
          ordersResponse,
          bookResponse,
          tradesResponse,
        ] = await Promise.all([
          fetch("/api/assets", {
            cache: "no-store",
          }),

          fetch(
            tradingMode === "demo"
              ? "/api/demo/wallet"
              : "/api/wallet",
            {
              cache: "no-store",
            }
          ),

          fetch(
            `/api/orders?symbol=${symbol}&mode=${tradingMode}&limit=500`,
            {
              cache: "no-store",
            }
          ),

          fetch(
            `/api/orderbook?symbol=${symbol}&mode=${tradingMode}&limit=30`,
            {
              cache: "no-store",
            }
          ),

          fetch(
            `/api/trades?symbol=${symbol}&mode=${tradingMode}&limit=100`,
            {
              cache: "no-store",
            }
          ),
        ]);

        const [assetData, walletData, orderData, bookData, tradeData] =
          await Promise.all([
            assetsResponse.json().catch(() => ({})),
            walletResponse.json().catch(() => ({})),
            ordersResponse.json().catch(() => ({})),
            bookResponse.json().catch(() => ({})),
            tradesResponse.json().catch(() => ({})),
          ]);

        if (!assetsResponse.ok || assetData.success === false) {
          throw new Error(assetData.message || "تعذر تحميل العملات");
        }

        setAssets(Array.isArray(assetData.assets) ? assetData.assets : []);

        const walletBalances =
          walletData?.wallet?.balances ||
          walletData?.spot?.balances ||
          [];

        setBalances(Array.isArray(walletBalances) ? walletBalances : []);
        setOrders(Array.isArray(orderData.orders) ? orderData.orders : []);

        const rawBids =
          bookData.bids ||
          bookData.buy ||
          bookData.data?.bids ||
          [];

        const rawAsks =
          bookData.asks ||
          bookData.sell ||
          bookData.data?.asks ||
          [];

        setBids(normalizeRows(rawBids));
        setAsks(normalizeRows(rawAsks));
        setTrades(Array.isArray(tradeData.trades) ? tradeData.trades : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل بيانات التداول");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [symbol, tradingMode]
  );

  useEffect(() => {
    loadAll();

    const interval = window.setInterval(() => {
      loadAll(true);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    if (currentPrice > 0 && !price) {
      setPrice(String(currentPrice));
    }
  }, [currentPrice, price]);


    /*
     * التداول التجريبي والحقيقي منفصلان بالكامل عبر mode.
     */
  const createOrder = async () => {
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
        "Idempotency-Key": crypto.randomUUID(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol,
          side,
          type: orderType,
          ...(orderType === "limit" ? { price: Number(price) } : {}),
          quantity: Number(quantity),
          mode: tradingMode,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "تعذر إنشاء الأمر");
      }

      setMessage(
        data.message ||
          (side === "buy" ? "تم إنشاء أمر الشراء" : "تم إنشاء أمر البيع")
      );

      setQuantity("");
      await loadAll(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الأمر");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrder = async (id: string) => {
    setCancellingId(id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          mode: tradingMode,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "تعذر إلغاء الأمر");
      }

      setMessage("تم إلغاء الأمر وإرجاع الرصيد المتبقي");
      await loadAll(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إلغاء الأمر");
    } finally {
      setCancellingId("");
    }
  };

  const percentageQuantity = (percent: number) => {
    const available =
      side === "buy" ? num(quoteBalance.available) : num(baseBalance.available);

    const p = num(price) || currentPrice;

    if (!p) return;

    const qty =
      side === "buy"
        ? (available * percent) / 100 / p
        : (available * percent) / 100;

    setQuantity(qty > 0 ? String(qty) : "");
  };

  const total = num(price) * num(quantity);

  const pairs = useMemo(() => {
    const list = assets
      .filter((a) => a.enabled !== false && a.tradingEnabled !== false)
      .map((a) => String(a.symbol || "").toUpperCase())
      .filter(Boolean);

    return Array.from(new Set(list));
  }, [assets]);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <div className="border-b border-white/[0.06] bg-[#07101d]">
        <div className="flex min-h-[72px] items-center gap-5 px-5">
          <div className="flex min-w-[190px] items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
              ₿
            </div>

            <div>
              <div className="flex items-center gap-2">
                <select
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value);
                    setPrice("");
                  }}
                  className="cursor-pointer appearance-none bg-transparent text-lg font-bold outline-none"
                >
                  {(pairs.length ? pairs : ["BTC"]).map((base) => (
                    <option
                      key={base}
                      value={`${base}USDT`}
                      className="bg-[#07101d]"
                    >
                      {base}/USDT
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="text-slate-500" />
              </div>
              <div className="text-[11px] text-slate-500">
                التداول الفوري
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-8 lg:flex">
            <div>
              <div className="text-xl font-semibold">
                {currentPrice ? fmt(currentPrice, 4) : "—"}
              </div>
              <div className="text-[10px] text-slate-500">USDT</div>
            </div>

            <div>
              <div
                className={
                  marketChange >= 0
                    ? "text-sm text-emerald-400"
                    : "text-sm text-rose-400"
                }
              >
                {marketChange >= 0 ? "+" : ""}
                {fmt(marketChange, 2)}%
              </div>
              <div className="text-[10px] text-slate-500">24h</div>
            </div>

            <div>
              <div className="text-sm font-medium">
                {fmt(selectedAsset?.current_price, 2)}
              </div>
              <div className="text-[10px] text-slate-500">السعر</div>
            </div>

            <div>
              <div className="text-sm font-medium">
                {money(selectedAsset?.total_volume)}
              </div>
              <div className="text-[10px] text-slate-500">حجم التداول</div>
            </div>
          </div>

          <div className="mr-auto flex items-center gap-2">
            <button
              onClick={() => loadAll()}
              disabled={refreshing}
              className="rounded-lg border border-white/[0.08] p-2.5 text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
              title="تحديث"
            >
              <RefreshCw
                size={17}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>

            <button className="rounded-lg border border-white/[0.08] p-2.5 text-slate-400 hover:bg-white/[0.05] hover:text-white">
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </div>

      {(error || message) && (
        <div className="border-b border-white/[0.06] px-5 py-2">
          {error && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}
          {!error && message && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-300">
              {message}
            </div>
          )}
        </div>
      )}

      <div className="border-b border-white/[0.06] bg-[#07101d] px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">
              وضع التداول
            </span>

            <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
              <button
                type="button"
                onClick={() => setTradingMode("demo")}
                className={
                  tradingMode === "demo"
                    ? "rounded-md bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-300"
                    : "rounded-md px-4 py-2 text-xs text-slate-500 hover:text-white"
                }
              >
                تجريبي
              </button>

              <button
                type="button"
                onClick={() => setTradingMode("live")}
                className={
                  tradingMode === "live"
                    ? "rounded-md bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-300"
                    : "rounded-md px-4 py-2 text-xs text-slate-500 hover:text-white"
                }
              >
                حقيقي
              </button>
            </div>
          </div>

          {tradingMode === "demo" ? (
            <span className="rounded-full border border-cyan-400/10 bg-cyan-400/[0.06] px-3 py-1 text-[11px] font-semibold text-cyan-300">
              حساب تجريبي — لا توجد أموال حقيقية
            </span>
          ) : (
            <span className="rounded-full border border-emerald-400/10 bg-emerald-400/[0.06] px-3 py-1 text-[11px] font-semibold text-emerald-300">
              حساب حقيقي
            </span>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <div className="grid grid-cols-1 border-b border-white/[0.06] lg:grid-cols-[minmax(0,1fr)_310px]">
            <div className="border-l border-white/[0.06]">
              <div className="flex h-12 items-center gap-5 border-b border-white/[0.06] px-4">
                <button className="text-sm font-medium text-white">
                  حركة السوق
                </button>
                <button className="text-xs text-slate-500 hover:text-white">
                  TradingView
                </button>
                <button className="text-xs text-slate-500 hover:text-white">
                  العمق
                </button>
              </div>

              <Chart trades={trades} price={currentPrice} />
            </div>

            <div className="min-h-[650px]">
              <OrderBook
                asks={asks}
                bids={bids}
                currentPrice={currentPrice}
              />
            </div>
          </div>

          <div className="border-b border-white/[0.06] bg-[#060c15]">
            <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
              <h3 className="text-sm font-semibold">آخر الصفقات</h3>
              <span className="text-[10px] text-slate-500">
                السعر / الكمية / الوقت
              </span>
            </div>

            <div className="grid grid-cols-3 px-4 py-2 text-[10px] text-slate-500">
              <span>السعر</span>
              <span className="text-right">الكمية</span>
              <span className="text-right">الوقت</span>
            </div>

            <div className="max-h-[230px] overflow-auto">
              {trades.slice(0, 20).map((trade, i) => {
                const isBuy =
                  String(trade.side || "").toLowerCase() === "buy";

                return (
                  <div
                    key={trade._id || i}
                    className="grid grid-cols-3 px-4 py-1.5 text-[12px]"
                  >
                    <span
                      className={
                        isBuy ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {fmt(trade.price, 4)}
                    </span>
                    <span className="text-right text-slate-300">
                      {fmt(trade.quantity, 6)}
                    </span>
                    <span className="text-right text-slate-500">
                      {time(trade.createdAt)}
                    </span>
                  </div>
                );
              })}

              {!trades.length && (
                <div className="py-8 text-center text-xs text-slate-600">
                  لا توجد صفقات متاحة
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#060c15]">
            <div className="flex h-14 items-center gap-7 border-b border-white/[0.06] px-5">
              <button
                onClick={() => setTab("open")}
                className={
                  tab === "open"
                    ? "h-full border-b-2 border-cyan-400 text-sm font-semibold text-white"
                    : "text-sm text-slate-500"
                }
              >
                الأوامر المفتوحة ({openOrders.length})
              </button>

              <button
                onClick={() => setTab("history")}
                className={
                  tab === "history"
                    ? "h-full border-b-2 border-cyan-400 text-sm font-semibold text-white"
                    : "text-sm text-slate-500"
                }
              >
                سجل الأوامر ({historyOrders.length})
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-right text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-white/[0.05]">
                    <th className="px-4 py-3 font-normal">الزوج</th>
                    <th className="px-4 py-3 font-normal">النوع</th>
                    <th className="px-4 py-3 font-normal">الجانب</th>
                    <th className="px-4 py-3 font-normal">السعر</th>
                    <th className="px-4 py-3 font-normal">الكمية</th>
                    <th className="px-4 py-3 font-normal">التنفيذ</th>
                    <th className="px-4 py-3 font-normal">الحالة</th>
                    <th className="px-4 py-3 font-normal">الوقت</th>
                    <th className="px-4 py-3 font-normal"></th>
                  </tr>
                </thead>

                <tbody>
                  {(tab === "open" ? openOrders : historyOrders).map(
                    (order, i) => (
                      <tr
                        key={order._id || i}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3 font-medium">
                          {order.symbol}
                        </td>

                        <td className="px-4 py-3 text-slate-400">
                          {order.type === "limit" ? "Limit" : order.type}
                        </td>

                        <td
                          className={
                            String(order.side).toLowerCase() === "buy"
                              ? "px-4 py-3 text-emerald-400"
                              : "px-4 py-3 text-rose-400"
                          }
                        >
                          {String(order.side).toLowerCase() === "buy"
                            ? "شراء"
                            : "بيع"}
                        </td>

                        <td className="px-4 py-3">
                          {fmt(order.price, 4)}
                        </td>

                        <td className="px-4 py-3">
                          {fmt(order.originalQuantity ?? order.quantity, 6)}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex min-w-[100px] items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                              <div
                                className="h-full rounded-full bg-cyan-400"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(0, num(order.fillPercent))
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500">
                              {fmt(order.fillPercent, 1)}%
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-400">
                          {order.status === "open"
                            ? "مفتوح"
                            : order.status === "filled"
                            ? "مكتمل"
                            : order.status === "cancelled"
                            ? "ملغي"
                            : order.status || "—"}
                        </td>

                        <td className="px-4 py-3 text-slate-500">
                          {time(order.createdAt)}
                        </td>

                        <td className="px-4 py-3">
                          {order.status === "open" && order._id && (
                            <button
                              onClick={() => cancelOrder(order._id!)}
                              disabled={cancellingId === order._id}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                            >
                              {cancellingId === order._id ? (
                                <RefreshCw size={14} className="animate-spin" />
                              ) : (
                                <X size={14} />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>

              {!(tab === "open" ? openOrders : historyOrders).length && (
                <div className="py-12 text-center text-xs text-slate-600">
                  لا توجد أوامر
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="border-r border-white/[0.06] bg-[#07101d]">
          <div className="border-b border-white/[0.06] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">الرصيد المتاح</div>
                <div className="mt-1 text-sm font-medium">
                  
          <div className="mb-3 flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
            {(["limit", "market"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setOrderType(type)}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-bold transition ${
                  orderType === type
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "text-slate-500 hover:text-white"
                }`}
              >
                {type === "limit" ? "Limit" : "Market"}
              </button>
            ))}
          </div>

{side === "buy"
                    ? `${fmt(quoteBalance.available, 4)} USDT`
                    : `${fmt(baseBalance.available, 6)} ${baseAsset}`}
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.04] p-2 text-slate-400">
                <Clock3 size={17} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="text-[10px] text-slate-500">
                  {baseAsset}
                </div>
                <div className="mt-1 text-xs font-medium">
                  {fmt(baseBalance.total, 8)}
                </div>
              </div>

              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="text-[10px] text-slate-500">
                  USDT
                </div>
                <div className="mt-1 text-xs font-medium">
                  {fmt(quoteBalance.total, 4)}
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-white/[0.06] p-4">
            <div className="mb-4 flex gap-1 rounded-lg bg-white/[0.035] p-1">
              
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
                className={
                  side === "buy"
                    ? "flex-1 rounded-md bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-400"
                    : "flex-1 py-2.5 text-sm text-slate-500"
                }
              >
                شراء {baseAsset}
              </button>

              <button
                onClick={() => setSide("sell")}
                className={
                  side === "sell"
                    ? "flex-1 rounded-md bg-rose-500/15 py-2.5 text-sm font-semibold text-rose-400"
                    : "flex-1 py-2.5 text-sm text-slate-500"
                }
              >
                بيع {baseAsset}
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs text-slate-400">Limit</span>
              <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">
                تنفيذ فعلي
              </span>
            </div>

            <label className="mb-2 block text-[11px] text-slate-500">
              السعر
            </label>

            <div className="mb-4 flex h-11 items-center rounded-lg border border-white/[0.08] bg-[#050a13] px-3 focus-within:border-cyan-400/50">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder={currentPrice ? String(currentPrice) : "0.00"}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <span className="text-[11px] text-slate-500">USDT</span>
            </div>

            <label className="mb-2 block text-[11px] text-slate-500">
              الكمية
            </label>

            <div className="mb-3 flex h-11 items-center rounded-lg border border-white/[0.08] bg-[#050a13] px-3 focus-within:border-cyan-400/50">
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                placeholder="0.00000000"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <span className="text-[11px] text-slate-500">
                {baseAsset}
              </span>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((percent) => (
                <button
                  key={percent}
                  onClick={() => percentageQuantity(percent)}
                  className="rounded-md border border-white/[0.06] py-1.5 text-[10px] text-slate-500 hover:bg-white/[0.04] hover:text-white"
                >
                  {percent}%
                </button>
              ))}
            </div>

            <div className="mb-5 flex items-center justify-between text-xs">
              <span className="text-slate-500">الإجمالي</span>
              <span className="font-medium">
                {total > 0 ? `${money(total)} USDT` : "—"}
              </span>
            </div>

            <button
              onClick={createOrder}
              disabled={
                submitting ||
                !Number(price) ||
                !Number(quantity) ||
                Number(price) <= 0 ||
                Number(quantity) <= 0
              }
              className={
                side === "buy"
                  ? "w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-[#03100a] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  : "w-full rounded-lg bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
              }
            >
              {submitting
                ? "جاري التنفيذ..."
                : side === "buy"
                ? `شراء ${baseAsset}`
                : `بيع ${baseAsset}`}
            </button>

            <div className="mt-3 text-center text-[10px] leading-5 text-slate-600">
              أوامر Limit فقط حاليًا — يتم تمرير الأمر إلى محرك المطابقة الفعلي.
            </div>
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">أرصدة التداول</h3>
              <Search size={15} className="text-slate-600" />
            </div>

            <div className="space-y-1">
              {balances.slice(0, 8).map((balance, i) => (
                <div
                  key={`${balance.asset}-${i}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2.5 hover:bg-white/[0.03]"
                >
                  <span className="text-xs font-medium">
                    {balance.asset}
                  </span>
                  <div className="text-left">
                    <div className="text-xs">
                      {fmt(balance.available, 8)}
                    </div>
                    {num(balance.locked) > 0 && (
                      <div className="text-[9px] text-amber-400">
                        مقفل: {fmt(balance.locked, 8)}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {!balances.length && (
                <div className="py-5 text-center text-xs text-slate-600">
                  لا توجد أرصدة
                </div>
              )}
            </div>
          </div>
        </aside>
      </section>

      {loading && (
        <div className="fixed bottom-5 left-5 rounded-lg border border-white/[0.08] bg-[#07101d] px-4 py-2 text-xs text-slate-400 shadow-xl">
          جاري تحميل بيانات التداول...
        </div>
      )}
    </main>
  );
}