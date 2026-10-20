"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  Clock3,
  Maximize2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";

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

type LiveTicker = {
  symbol: string;
  price: number;
  change24h: number;
  quoteVolume: number;
  high24h: number;
  low24h: number;
};

type SpotMarketPair = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number;
  tradeCount: number;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
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
      amount: num(item?.amount ?? item?.total ?? item?.quoteAmount ?? item?.[2]),
    }))
    .filter((item) => item.price > 0 && item.quantity > 0);
}

function Chart({ symbol }: { symbol: string }) {
  const [interval, setIntervalValue] = useState<"1m" | "5m" | "15m" | "1h" | "4h" | "1d">("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [feed, setFeed] = useState<"connecting" | "live" | "reconnecting" | "snapshot" | "offline">("connecting");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let snapshotTimer: number | undefined;
    let retryCount = 0;
    let socketConnected = false;
    const pair = symbol.trim().toUpperCase();
    setCandles([]);
    setFeed("connecting");

    const mergeCandle = (next: Candle) => {
      if (!Number.isFinite(next.time) || next.open <= 0 || next.high <= 0 || next.low <= 0 || next.close <= 0) return;
      setCandles((previous) => {
        const existing = previous.findIndex((item) => item.time === next.time);
        if (existing >= 0) {
          const updated = [...previous];
          updated[existing] = next;
          return updated.slice(-90);
        }
        return [...previous, next].sort((a, b) => a.time - b.time).slice(-90);
      });
    };

    const parseKline = (row: any): Candle => ({
      time: Number(row?.t ?? row?.[0]),
      open: Number(row?.o ?? row?.[1]),
      high: Number(row?.h ?? row?.[2]),
      low: Number(row?.l ?? row?.[3]),
      close: Number(row?.c ?? row?.[4]),
      volume: Number(row?.v ?? row?.[5]),
      closed: Boolean(row?.x ?? true),
    });

    const loadSnapshot = async () => {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=90`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Candle snapshot unavailable");
        const rows = await response.json();
        if (stopped || !Array.isArray(rows)) return;
        setCandles(rows.map(parseKline).filter((item: Candle) => item.open > 0 && item.close > 0).slice(-90));
        if (!socketConnected) setFeed("snapshot");
      } catch {
        if (!stopped && !socketConnected) setFeed("offline");
      }
    };

    const connect = () => {
      if (stopped) return;
      try {
        socket = new WebSocket(
          `wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@kline_${interval}`
        );
        socket.onopen = () => {
          if (stopped) return;
          socketConnected = true;
          retryCount = 0;
          setFeed("live");
        };
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data));
            if (stopped || !message?.k) return;
            mergeCandle(parseKline(message.k));
            setFeed("live");
          } catch {
            // Ignore malformed public market-data packets.
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          socketConnected = false;
          if (stopped) return;
          setFeed("reconnecting");
          const delay = Math.min(1000 * 2 ** retryCount, 15000);
          retryCount = Math.min(retryCount + 1, 4);
          reconnectTimer = window.setTimeout(connect, delay);
        };
      } catch {
        setFeed("offline");
        reconnectTimer = window.setTimeout(connect, 5000);
      }
    };

    void loadSnapshot();
    snapshotTimer = window.setInterval(() => {
      if (!socketConnected) void loadSnapshot();
    }, 5000);
    connect();

    return () => {
      stopped = true;
      socketConnected = false;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (snapshotTimer !== undefined) window.clearInterval(snapshotTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [symbol, interval]);

  const plotted = candles.slice(-70);
  const high = plotted.length ? Math.max(...plotted.map((candle) => candle.high)) : 0;
  const low = plotted.length ? Math.min(...plotted.map((candle) => candle.low)) : 0;
  const range = high - low || high * 0.001 || 1;
  const y = (price: number) => 16 + ((high - price) / range) * 218;
  const candleStep = 960 / Math.max(plotted.length, 1);
  const candleWidth = Math.max(3, Math.min(11, candleStep * 0.62));

  return (
    <div className={expanded
      ? "fixed inset-3 z-[100] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#060c15] shadow-2xl"
      : "relative w-full overflow-hidden bg-[#060c15]"}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-1">
          {([
            ["1m", "1د"], ["5m", "5د"], ["15m", "15د"],
            ["1h", "1س"], ["4h", "4س"], ["1d", "1ي"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setIntervalValue(value)}
              className={interval === value
                ? "rounded-md bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300"
                : "rounded-md px-2.5 py-1.5 text-[11px] text-slate-500 hover:bg-white/5 hover:text-white"}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className={feed === "live" ? "text-[10px] text-emerald-400" : "text-[10px] text-amber-300"}>
            {feed === "live" ? "● شموع مباشرة" : feed === "snapshot" ? "● بيانات مع تحديث احتياطي" : feed === "reconnecting" ? "● استعادة اتصال الرسم" : feed === "offline" ? "● الرسم غير متاح حاليًا" : "● جاري الاتصال"}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "تصغير الرسم" : "تكبير الرسم"}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            {expanded ? <X size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div className={expanded ? "relative min-h-0 flex-1" : "relative h-[330px] w-full"}>
        <svg
          viewBox="0 0 1000 280"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`مخطط الشموع اليابانية ${symbol} بفاصل ${interval}`}
        >
          {[0, 1, 2, 3, 4].map((row) => (
            <line key={`h-${row}`} x1="0" x2="1000" y1={row * 65 + 10} y2={row * 65 + 10} stroke="currentColor" strokeOpacity="0.10" vectorEffect="non-scaling-stroke" className="text-slate-400" />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((column) => (
            <line key={`v-${column}`} x1={column * 125} x2={column * 125} y1="0" y2="280" stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" className="text-slate-400" />
          ))}
          {plotted.map((candle, index) => {
            const x = 20 + (index + 0.5) * candleStep;
            const rising = candle.close >= candle.open;
            const openY = y(candle.open);
            const closeY = y(candle.close);
            return (
              <g key={candle.time} className={rising ? "text-emerald-400" : "text-rose-400"}>
                <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
                <rect
                  x={x - candleWidth / 2}
                  y={Math.min(openY, closeY)}
                  width={candleWidth}
                  height={Math.max(1.5, Math.abs(closeY - openY))}
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="0.5"
                />
              </g>
            );
          })}
        </svg>
        {!plotted.length ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-slate-500">
            جاري تحميل بيانات الشموع الحقيقية للسوق…
          </div>
        ) : null}
        {plotted.length ? (
          <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] text-slate-600">
            <span>{new Date(plotted[0].time).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
            <span>{new Date(plotted[plotted.length - 1].time).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] px-3 py-2 text-[10px] text-slate-500">
        <span>{symbol} · شموع يابانية · {interval}</span>
        <span>السوق المرجعي: Binance</span>
        {plotted.length ? <span>أعلى {fmt(high, 4)} · أدنى {fmt(low, 4)}</span> : null}
      </div>
    </div>
  );
}

function OrderBook({
  asks,
  bids,
  currentPrice,
  quoteAsset,
}: {
  asks: BookOrder[];
  bids: BookOrder[];
  currentPrice: number;
  quoteAsset: string;
}) {
  const visibleAsks = [...asks]
    .sort((a, b) => num(a.price) - num(b.price))
    .slice(0, 12)
    .reverse();

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
        <span>السعر ({quoteAsset})</span>
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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-base font-semibold text-cyan-400">
            {currentPrice > 0 ? fmt(currentPrice, 4) : "—"} <span className="text-[10px] text-slate-500">{quoteAsset}</span>
          </div>
          <span className="text-[10px] text-slate-600">السعر المرجعي من Binance</span>
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

export default function ProTradeTerminal() {
  const pathname = usePathname();
  const internalShell = !pathname.startsWith("/trading/");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [availablePairs, setAvailablePairs] = useState<SpotMarketPair[]>([]);
  const [pairFeedLoading, setPairFeedLoading] = useState(true);
  const [pairFeedError, setPairFeedError] = useState("");
  const [executionConfigured, setExecutionConfigured] = useState(false);
  const [executionTestnet, setExecutionTestnet] = useState(false);
  const [pairReload, setPairReload] = useState(0);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [personalTrades, setPersonalTrades] = useState<Trade[]>([]);
  const [asks, setAsks] = useState<BookOrder[]>([]);
  const [bids, setBids] = useState<BookOrder[]>([]);
  const [liveTicker, setLiveTicker] = useState<LiveTicker | null>(null);
  const [priceFeedStatus, setPriceFeedStatus] = useState<"connecting" | "live" | "reconnecting" | "offline" | "snapshot">("connecting");
  const [orderBookFeedStatus, setOrderBookFeedStatus] = useState<"connecting" | "live" | "reconnecting" | "polling">("connecting");

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);

  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"open" | "history" | "trades">("open");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const querySymbol = params.get("symbol");
    const normalized = String(querySymbol || "").trim().toUpperCase().replace(/[_/\\s-]/g, "");
    const requestedTab = params.get("tab");
    if (/^[A-Z0-9]{5,25}$/.test(normalized)) setSymbol(normalized);
    if (requestedTab === "trades") setTab("trades");
    else if (requestedTab === "history") setTab("history");
    else if (requestedTab === "open") setTab("open");

    let active = true;
    setPairFeedLoading(true);

    async function loadAvailablePairs() {
      try {
        const response = await fetch("/api/market/binance", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success !== true || !Array.isArray(data?.pairs) || data.pairs.length === 0) {
          throw new Error(data?.message || "لم تصل قائمة أزواج التداول من Binance. اضغط إعادة تحميل الأزواج.");
        }
        if (!active) return;
        const nextPairs = data.pairs as SpotMarketPair[];
        setExecutionConfigured(Boolean(data.execution?.configured));
        setExecutionTestnet(Boolean(data.execution?.testnet));
        setAvailablePairs(nextPairs);
        setPairFeedError("");
        setSymbol((current) => {
          if (nextPairs.some((pair) => pair.symbol === current)) return current;
          if (normalized && nextPairs.some((pair) => pair.symbol === normalized)) return normalized;
          return nextPairs.find((pair) => pair.symbol === "BTCUSDT")?.symbol || nextPairs[0].symbol;
        });
      } catch (error) {
        if (active) {
          setPairFeedError(error instanceof Error ? error.message : "تعذر تحميل أزواج التداول.");
        }
      } finally {
        if (active) setPairFeedLoading(false);
      }
    }

    void loadAvailablePairs();
    const timer = window.setInterval(() => void loadAvailablePairs(), 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pairReload]);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let snapshotTimer: number | undefined;
    let retryCount = 0;
    let socketConnected = false;
    const pair = symbol.trim().toUpperCase();
    setLiveTicker(null);
    setPriceFeedStatus("connecting");

    const applyTicker = (payload: any, fromSocket = false) => {
      const priceValue = Number(payload?.c ?? payload?.lastPrice);
      if (!Number.isFinite(priceValue) || priceValue <= 0) return;

      const changeValue = Number(payload?.P ?? payload?.priceChangePercent);
      const volumeValue = Number(payload?.q ?? payload?.quoteVolume);

      setLiveTicker({
        symbol: pair,
        price: priceValue,
        change24h: Number.isFinite(changeValue) ? changeValue : 0,
        quoteVolume: Number.isFinite(volumeValue) ? volumeValue : 0,
        high24h: Number(payload?.h ?? payload?.highPrice) || 0,
        low24h: Number(payload?.l ?? payload?.lowPrice) || 0,
      });
      setPriceFeedStatus(fromSocket || socketConnected ? "live" : "snapshot");
    };

    const loadSnapshot = async () => {
      try {
        const response = await fetch(
          "/api/trading/market?symbol=" + encodeURIComponent(pair),
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Market ticker unavailable");
        const result = await response.json();
        if (!stopped) applyTicker(result?.ticker || result);
      } catch {
        if (!stopped && !socketConnected) setPriceFeedStatus("offline");
      }
    };

    const connect = () => {
      if (stopped) return;
      try {
        socket = new WebSocket(
          `wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@ticker`
        );
        socket.onopen = () => {
          if (stopped) return;
          socketConnected = true;
          retryCount = 0;
          setPriceFeedStatus("live");
        };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data));
            if (!stopped) applyTicker(payload, true);
          } catch {
            // Ignore malformed market data packets.
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          socketConnected = false;
          if (stopped) return;
          setPriceFeedStatus("reconnecting");
          const delay = Math.min(1000 * 2 ** retryCount, 15000);
          retryCount = Math.min(retryCount + 1, 4);
          retryTimer = window.setTimeout(connect, delay);
        };
      } catch {
        setPriceFeedStatus("offline");
        retryTimer = window.setTimeout(connect, 5000);
      }
    };

    void loadSnapshot();
    snapshotTimer = window.setInterval(() => {
      if (!socketConnected) void loadSnapshot();
    }, 5000);
    connect();

    return () => {
      stopped = true;
      socketConnected = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (snapshotTimer !== undefined) window.clearInterval(snapshotTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [symbol]);

  useEffect(() => {
    let stopped = false;
    let streamConnected = false;
    let stream: EventSource | null = null;
    setBids([]);
    setAsks([]);
    setOrderBookFeedStatus("connecting");
    const query = `symbol=${encodeURIComponent(symbol)}&depth=30`;

    const applyOrderBook = (payload: any) => {
      const book = payload?.orderBook ?? payload?.data ?? payload;
      setBids(normalizeRows(book?.bids ?? book?.buy ?? []));
      setAsks(normalizeRows(book?.asks ?? book?.sell ?? []));
    };

    const loadOrderBookFallback = async () => {
      if (stopped || streamConnected) return;
      try {
        const response = await fetch(`/api/orderbook?${query}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.message || "تعذر تحديث دفتر الأوامر");
        }
        if (!stopped) {
          applyOrderBook(payload);
          if (!streamConnected) setOrderBookFeedStatus("polling");
        }
      } catch {
        if (!stopped && !streamConnected) setOrderBookFeedStatus("reconnecting");
      }
    };

    try {
      stream = new EventSource(`/api/orderbook/stream?${query}`);
      stream.onopen = () => {
        streamConnected = true;
        setOrderBookFeedStatus("live");
      };
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (stopped) return;
          applyOrderBook(payload);
          streamConnected = true;
          setOrderBookFeedStatus("live");
        } catch {
          // Keep the last valid book snapshot.
        }
      };
      stream.onerror = () => {
        streamConnected = false;
        setOrderBookFeedStatus("reconnecting");
        void loadOrderBookFallback();
      };
    } catch {
      setOrderBookFeedStatus("polling");
    }

    void loadOrderBookFallback();
    const fallbackTimer = window.setInterval(() => void loadOrderBookFallback(), 2000);

    return () => {
      stopped = true;
      window.clearInterval(fallbackTimer);
      stream?.close();
    };
  }, [symbol]);

  const selectedPair = availablePairs.find((pair) => pair.symbol === symbol);
  const inferredQuote = ["FDUSD", "USDT", "USDC", "TUSD", "USDP", "BUSD", "BIDR", "IDRT", "USDP", "DAI", "BTC", "ETH", "BNB", "TRY", "EUR", "BRL", "AUD", "GBP", "RUB"].find((item) => symbol.endsWith(item)) || "USDT";
  const quoteAsset = selectedPair?.quoteAsset || inferredQuote;
  const baseAsset = selectedPair?.baseAsset || symbol.slice(0, Math.max(0, symbol.length - quoteAsset.length)).toUpperCase();

  const currentPrice = useMemo(() => {
    if (liveTicker?.symbol === symbol && num(liveTicker.price) > 0) {
      return num(liveTicker.price);
    }
    const last = trades.find((trade) => String(trade.symbol || "").toUpperCase() === symbol && num(trade.price) > 0);
    if (last) return num(last.price);
    const ask = asks.find((item) => num(item.price) > 0);
    if (ask) return num(ask.price);
    return 0;
  }, [liveTicker, symbol, trades, asks]);

  const marketExecutionPrice = side === "buy"
    ? num(asks[0]?.price)
    : num(bids[0]?.price);

  const marketChange =
    liveTicker?.symbol === symbol ? num(liveTicker.change24h) : null;

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
          tradesResponse,
          personalTradesResponse,
        ] = await Promise.all([
          fetch("/api/assets", { cache: "no-store" }),
          fetch("/api/wallet", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/orders?symbol=${encodeURIComponent(symbol)}&limit=500`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/trades?market=true&symbol=${encodeURIComponent(symbol)}&limit=100`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/trades?limit=100", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const [assetData, walletData, orderData, tradeData, personalTradeData] = await Promise.all([
          assetsResponse.json().catch(() => ({})),
          walletResponse.json().catch(() => ({})),
          ordersResponse.json().catch(() => ({})),
          tradesResponse.json().catch(() => ({})),
          personalTradesResponse.json().catch(() => ({})),
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

        if (ordersResponse.ok && Array.isArray(orderData.orders)) {
          setOrders(orderData.orders);
        } else {
          setOrders([]);
          if (ordersResponse.status === 403 || ordersResponse.status === 401) {
            setError(orderData.message || "سجّل الدخول لعرض سجل الأوامر والتداول.");
          }
        }

        setTrades(Array.isArray(tradeData.trades) ? tradeData.trades : []);
        setPersonalTrades(
          personalTradesResponse.ok && personalTradeData?.success !== false && Array.isArray(personalTradeData?.trades)
            ? personalTradeData.trades
            : []
        );

      } catch (err) {
        setError(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل بيانات التداول");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [symbol]
  );

  useEffect(() => {
    loadAll();

    const interval = window.setInterval(() => {
      loadAll(true);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    if (currentPrice > 0 && !price) {
      setPrice(String(currentPrice));
    }
  }, [currentPrice, price]);


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
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "تعذر إنشاء الأمر");
      }

      // Live Spot orders must be confirmed as Binance orders. Never present an
      // internal/legacy matching-engine response as a real exchange execution.
      if (data.executionProvider !== "binance") {
        await loadAll(true);
        throw new Error(
          "لم يؤكد الخادم إرسال الأمر إلى Binance؛ لم يتم اعتماد العملية كصفقة حقيقية. راجع سجل الأوامر قبل إعادة المحاولة لتجنب تكرار الطلب."
        );
      }

      const matchedQuantity = Array.isArray(data?.matching?.trades)
        ? data.matching.trades.reduce((sum: number, trade: any) => sum + Math.max(0, Number(trade?.quantity) || 0), 0)
        : 0;
      const executedLabel = matchedQuantity.toLocaleString("en-US", { maximumFractionDigits: 8 });
      setMessage(String(data.message || (
        matchedQuantity > 0
          ? `أكدت Binance تنفيذ ${executedLabel} ${baseAsset}.`
          : "تم إرسال الأمر إلى Binance؛ راجع حالة الأمر والكمية المنفذة في سجل التداول."
      )));

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

    const p = orderType === "market" ? (marketExecutionPrice || currentPrice) : num(price) || currentPrice;

    if (!p) return;

    const qty =
      side === "buy"
        ? (available * percent) / 100 / p
        : (available * percent) / 100;

    setQuantity(qty > 0 ? String(qty) : "");
  };

  const effectiveOrderPrice = orderType === "market" ? (marketExecutionPrice || currentPrice) : num(price);
  const total = effectiveOrderPrice * num(quantity);

  const selectableBaseAssets = useMemo(() => {
    const names = availablePairs
      .filter((pair) => pair.baseAsset && pair.quoteAsset)
      .map((pair) => pair.baseAsset.toUpperCase());
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [availablePairs]);

  const selectBaseAsset = (base: string) => {
    const candidates = availablePairs.filter((pair) => pair.baseAsset.toUpperCase() === base);
    const preferred = candidates.find((pair) => pair.quoteAsset === "USDT")
      || candidates.find((pair) => pair.quoteAsset === "USDC")
      || candidates[0];
    if (preferred) {
      setSymbol(preferred.symbol);
      setPrice("");
      setQuantity("");
      setError("");
      setMessage("");
    }
  };

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      {internalShell ? <InternalNavbar /> : null}
      <div className={internalShell ? "mx-auto flex max-w-[1700px]" : "mx-auto w-full max-w-[1700px]"}>
        {internalShell ? <InternalSidebar /> : null}
        <div className="min-w-0 flex-1">
      <div className="border-b border-white/[0.06] bg-[#07101d]">
        <div className="flex min-h-[72px] flex-wrap items-center gap-3 px-3 sm:px-5">
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
                  {availablePairs.length ? availablePairs.map((pair) => (
                    <option key={pair.symbol} value={pair.symbol} className="bg-[#07101d]">
                      {pair.baseAsset}/{pair.quoteAsset}
                    </option>
                  )) : (
                    <option value={symbol} disabled className="bg-[#07101d]">
                      {pairFeedLoading ? "جاري تحميل أزواج التداول..." : "تعذر تحميل الأزواج — أعد المحاولة"}
                    </option>
                  )}
                </select>
                <ChevronDown size={15} className="text-slate-500" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                <span>التداول الفوري · {availablePairs.length.toLocaleString("en-US")} زوج</span>
                <span className={priceFeedStatus === "live" ? "text-emerald-400" : "text-amber-300"}>
                  {priceFeedStatus === "live" ? "● سعر مباشر" : priceFeedStatus === "snapshot" ? "● تحديث احتياطي كل 5 ثوانٍ" : priceFeedStatus === "reconnecting" ? "● استعادة اتصال السعر" : priceFeedStatus === "offline" ? "● السعر غير متاح" : "● جاري الاتصال بالسوق"}
                </span>
                <span className={orderBookFeedStatus === "live" ? "text-emerald-400" : "text-amber-300"}>
                  {orderBookFeedStatus === "live" ? "● دفتر الأوامر مباشر" : orderBookFeedStatus === "polling" ? "● تحديث دوري" : "● تحديث دفتر الأوامر"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-6">
            <div>
              <div className="text-xl font-semibold">
                {currentPrice > 0 ? fmt(currentPrice, 4) : "—"}
              </div>
              <div className="text-[10px] text-slate-500">{quoteAsset}</div>
            </div>
            <div>
              <div className={marketChange === null ? "text-sm text-slate-400" : marketChange >= 0 ? "text-sm text-emerald-400" : "text-sm text-rose-400"}>
                {marketChange === null ? "—" : `${marketChange >= 0 ? "+" : ""}${fmt(marketChange, 2)}%`}
              </div>
              <div className="text-[10px] text-slate-500">24h</div>
            </div>
            <div className="hidden xl:block">
              <div className="text-sm font-medium">
                {liveTicker?.symbol === symbol && liveTicker.high24h > 0 ? fmt(liveTicker.high24h, 4) : "—"}
              </div>
              <div className="text-[10px] text-slate-500">أعلى 24 ساعة</div>
            </div>
            <div className="hidden xl:block">
              <div className="text-sm font-medium">
                {liveTicker?.symbol === symbol && liveTicker.low24h > 0 ? fmt(liveTicker.low24h, 4) : "—"}
              </div>
              <div className="text-[10px] text-slate-500">أدنى 24 ساعة</div>
            </div>
            <div className="hidden xl:block">
              <div className="text-sm font-medium">
                {money(liveTicker?.symbol === symbol ? liveTicker.quoteVolume : 0)}
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

          </div>
        </div>
      </div>

      {pairFeedError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-400/5 px-5 py-3 text-xs text-amber-200">
          <span>{pairFeedError}</span>
          <button type="button" onClick={() => setPairReload((value) => value + 1)} disabled={pairFeedLoading} className="inline-flex items-center gap-2 rounded-lg border border-amber-300/20 px-3 py-2 font-semibold hover:bg-amber-300/10 disabled:opacity-50">
            <RefreshCw size={14} className={pairFeedLoading ? "animate-spin" : ""} />
            إعادة تحميل الأزواج
          </button>
        </div>
      )}

      {(error || message) && (
        <div className="border-b border-white/[0.06] px-5 py-2">
          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
              <span>{error}</span>
              {(/توثيق|وثّق|الهوية|التحقق/.test(error)) && (
                <Link href="/dashboard/account/verification" className="rounded-md bg-cyan-400 px-3 py-2 font-bold text-slate-950">
                  الانتقال إلى التوثيق
                </Link>
              )}
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
          <span className="text-xs font-semibold text-slate-300">التداول الفوري</span>
          <span className={executionConfigured
            ? "rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-[11px] font-semibold text-emerald-300"
            : "rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1 text-[11px] font-semibold text-amber-200"}>
            {executionConfigured
              ? executionTestnet ? "اتصال Binance Testnet" : "تنفيذ Spot متصل بـ Binance"
              : "أسعار حية — تنفيذ Binance غير مهيأ"}
          </span>
        </div>
      </div>

      <p className="mt-2 px-5 text-[10px] leading-5 text-slate-500">
        السعر والمخطط ودفتر أوامر السوق وآخر الصفقات المعروضة من Binance.
        {executionConfigured
          ? executionTestnet
            ? " أوامر الشراء والبيع تُرسل إلى حساب Binance Testnet للاختبار، وليست تداولًا بأموال حقيقية."
            : " أوامر الشراء والبيع تُرسل إلى حساب Binance المرتبط. تأكد من كفاية أرصدة حساب المنصة ومطابقتها لأرصدة المستخدمين."
          : " التداول الحقيقي متوقف حتى يضبط الأدمن BINANCE_API_KEY وBINANCE_API_SECRET ويفعّل BINANCE_LIVE_TRADING_ENABLED على الخادم. لن ينفذ الموقع أمرًا داخليًا بديلًا."}
      </p>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <div className="grid grid-cols-1 border-b border-white/[0.06] lg:grid-cols-[minmax(0,1fr)_310px]">
            <div className="border-l border-white/[0.06]">
              <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
                <h3 className="text-sm font-semibold text-white">مخطط الشموع اليابانية</h3>
                <span className="text-[10px] text-slate-500">بيانات السوق المرجعي لحظيًا</span>
              </div>
              <Chart symbol={symbol} />
            </div>

            <div className="min-h-[650px]">
              <OrderBook
                asks={asks}
                bids={bids}
                currentPrice={currentPrice}
                quoteAsset={quoteAsset}
              />
            </div>
          </div>

          <div className="border-b border-white/[0.06] bg-[#060c15]">
            <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
              <h3 className="text-sm font-semibold">آخر صفقات السوق</h3>
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
                const isBuy = String(trade.side || "").toLowerCase() === "buy";
                const isSell = String(trade.side || "").toLowerCase() === "sell";

                return (
                  <div
                    key={trade._id || i}
                    className="grid grid-cols-3 px-4 py-1.5 text-[12px]"
                  >
                    <span
                      className={
                        isBuy ? "text-emerald-400" : isSell ? "text-rose-400" : "text-slate-400"
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
            <div className="flex h-14 flex-wrap items-center gap-5 border-b border-white/[0.06] px-5">
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

              <button
                onClick={() => setTab("trades")}
                className={
                  tab === "trades"
                    ? "h-full border-b-2 border-cyan-400 text-sm font-semibold text-white"
                    : "text-sm text-slate-500"
                }
              >
                سجل التداول ({personalTrades.length})
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className={`w-full ${tab === "trades" ? "min-w-[700px]" : "min-w-[850px]"} text-right text-xs`}>
                <thead className="text-slate-500">
                  {tab === "trades" ? (
                    <tr className="border-b border-white/[0.05]">
                      <th className="px-4 py-3 font-normal">الزوج</th>
                      <th className="px-4 py-3 font-normal">نوع العملية</th>
                      <th className="px-4 py-3 font-normal">سعر التنفيذ</th>
                      <th className="px-4 py-3 font-normal">الكمية</th>
                      <th className="px-4 py-3 font-normal">قيمة الصفقة</th>
                      <th className="px-4 py-3 font-normal">الوقت</th>
                    </tr>
                  ) : (
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
                  )}
                </thead>

                <tbody>
                  {tab === "trades"
                    ? personalTrades.map((trade, i) => (
                        <tr
                          key={trade._id || i}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3 font-medium">{trade.symbol || "—"}</td>
                          <td className={trade.side === "buy" ? "px-4 py-3 text-emerald-400" : "px-4 py-3 text-rose-400"}>
                            {trade.side === "buy" ? "شراء" : trade.side === "sell" ? "بيع" : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono">{fmt(trade.price ?? 0, 8)}</td>
                          <td className="px-4 py-3 font-mono">{fmt(trade.quantity ?? 0, 8)}</td>
                          <td className="px-4 py-3 font-mono">{fmt(trade.quoteAmount ?? (num(trade.price) * num(trade.quantity)), 8)}</td>
                          <td className="px-4 py-3 text-slate-500">{time(trade.createdAt)}</td>
                        </tr>
                      ))
                    : (tab === "open" ? openOrders : historyOrders).map(
                    (order, i) => (
                      <tr
                        key={order._id || i}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3 font-medium">
                          {order.symbol}
                        </td>

                        <td className="px-4 py-3 text-slate-400">
                          {order.type === "limit" ? "محدد (Limit)" : order.type === "market" ? "سوق (Market)" : order.type}
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
                          {num(order.price) > 0 ? fmt(order.price, 4) : order.type === "market" ? "سوق" : "—"}
                        </td>

                        <td className="px-4 py-3">
                          {fmt(order.originalQuantity ?? order.quantity ?? order.filledQuantity ?? 0, 8)}
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
                              {num(order.fillPercent).toFixed(1)}%
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

              {tab === "trades" ? (
                !loading && personalTrades.length === 0 && (
                  <div className="py-12 text-center text-xs text-slate-600">
                    لا توجد صفقات منفذة في حسابك حتى الآن.
                  </div>
                )
              ) : (
                !(tab === "open" ? openOrders : historyOrders).length && (
                  <div className="py-12 text-center text-xs text-slate-600">
                    لا توجد أوامر
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <aside className="border-r border-white/[0.06] bg-[#07101d]">
          <div className="border-b border-white/[0.06] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">الرصيد المتاح</div>
                <div className="mt-1 text-sm font-semibold">
                  {side === "buy"
                    ? `${fmt(quoteBalance.available ?? 0, 4)} ${quoteAsset}`
                    : `${fmt(baseBalance.available ?? 0, 8)} ${baseAsset}`}
                </div>
              </div>
              <div className="rounded-lg bg-white/[0.04] p-2 text-slate-400">
                <Clock3 size={17} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="text-[10px] text-slate-500">{baseAsset}</div>
                <div className="mt-1 text-xs font-medium">{fmt(baseBalance.total ?? 0, 8)}</div>
              </div>
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="text-[10px] text-slate-500">{quoteAsset}</div>
                <div className="mt-1 text-xs font-medium">{fmt(quoteBalance.total ?? 0, 4)}</div>
              </div>
            </div>
          </div>

          <div className="border-b border-white/[0.06] p-4">
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-white/[0.035] p-1">
              <button
                type="button"
                onClick={() => {
                  setSide("buy");
                  setAssetMenuOpen((open) => !open);
                }}
                aria-expanded={assetMenuOpen}
                aria-haspopup="listbox"
                className={side === "buy"
                  ? "flex items-center justify-center gap-1 rounded-md bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-400"
                  : "flex items-center justify-center gap-1 rounded-md py-2.5 text-sm text-slate-500 hover:text-white"}
              >
                شراء {baseAsset} <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSide("sell");
                  setAssetMenuOpen((open) => !open);
                }}
                aria-expanded={assetMenuOpen}
                aria-haspopup="listbox"
                className={side === "sell"
                  ? "flex items-center justify-center gap-1 rounded-md bg-rose-500/15 py-2.5 text-sm font-semibold text-rose-400"
                  : "flex items-center justify-center gap-1 rounded-md py-2.5 text-sm text-slate-500 hover:text-white"}
              >
                بيع {baseAsset} <ChevronDown size={14} />
              </button>
            </div>

            {assetMenuOpen && (
              <div role="listbox" aria-label="اختيار عملة التداول" className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-white/[0.10] bg-[#050a13] p-1 shadow-xl">
                {selectableBaseAssets.map((asset) => (
                  <button
                    key={asset}
                    type="button"
                    role="option"
                    aria-selected={asset === baseAsset}
                    onClick={() => {
                      selectBaseAsset(asset);
                      setAssetMenuOpen(false);
                    }}
                    className={asset === baseAsset
                      ? "flex w-full items-center justify-between rounded-md bg-cyan-400/10 px-3 py-2.5 text-right text-sm font-semibold text-cyan-300"
                      : "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-right text-sm text-slate-300 hover:bg-white/[0.06]"}
                  >
                    <span>{asset}</span>
                    {asset === baseAsset ? <span className="text-[10px]">✓ مختارة</span> : null}
                  </button>
                ))}
                {!selectableBaseAssets.length && <div className="px-3 py-2 text-xs text-slate-500">لا توجد عملات متاحة</div>}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-2 block text-xs text-slate-500">نوع الأمر</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.08] bg-[#050a13] p-1">
                {(["limit", "market"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setOrderType(type)}
                    className={orderType === type
                      ? "rounded-md bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-300"
                      : "rounded-md px-3 py-2 text-xs text-slate-500 hover:text-white"}
                  >
                    {type === "limit" ? "محدد (Limit)" : "سوق (Market)"}
                  </button>
                ))}
              </div>
            </div>

            <label className="mb-2 block text-[11px] text-slate-500">
              {orderType === "market" ? (side === "buy" ? "أفضل سعر بيع في دفتر Binance" : "أفضل سعر شراء في دفتر Binance") : "سعر الأمر المحدد"}
            </label>
            <div className="mb-4 flex h-11 items-center rounded-lg border border-white/[0.08] bg-[#050a13] px-3 focus-within:border-cyan-400/50">
              <input
                value={orderType === "market" ? (marketExecutionPrice > 0 ? String(marketExecutionPrice) : "") : price}
                onChange={(event) => setPrice(event.target.value)}
                disabled={orderType === "market"}
                inputMode="decimal"
                placeholder={orderType === "market" && marketExecutionPrice <= 0 ? "لا توجد سيولة مقابلة" : currentPrice > 0 ? String(currentPrice) : "0.00"}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:text-slate-500"
              />
              <span className="text-[11px] text-slate-500">{quoteAsset}</span>
            </div>

            <label className="mb-2 block text-[11px] text-slate-500">الكمية</label>
            <div className="mb-3 flex h-11 items-center rounded-lg border border-white/[0.08] bg-[#050a13] px-3 focus-within:border-cyan-400/50">
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="0.00000000"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <span className="text-[11px] text-slate-500">{baseAsset}</span>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => percentageQuantity(percent)}
                  className="rounded-md border border-white/[0.06] py-1.5 text-[10px] text-slate-500 hover:bg-white/[0.04] hover:text-white"
                >
                  {percent}%
                </button>
              ))}
            </div>

            <div className="mb-5 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {orderType === "market" ? "القيمة التقديرية حسب أفضل سعر متاح" : "إجمالي الأمر"}
              </span>
              <span className="font-medium">{total > 0 ? `${money(total)} ${quoteAsset}` : "—"}</span>
            </div>

            <button
              type="button"
              onClick={() => void createOrder()}
              disabled={
                submitting ||
                loading ||
                !Number(quantity) ||
                Number(quantity) <= 0 ||
                (orderType === "limit" && (!Number(price) || Number(price) <= 0)) ||
                (orderType === "market" && marketExecutionPrice <= 0)
              }
              className={side === "buy"
                ? "w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-[#03100a] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                : "w-full rounded-lg bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"}
            >
              {submitting ? "جارٍ إرسال الأمر..." : side === "buy" ? `شراء ${baseAsset}` : `بيع ${baseAsset}`}
            </button>

            <div className="mt-3 text-center text-[10px] leading-5 text-slate-600">
              {orderType === "market" && marketExecutionPrice <= 0
                ? "لا تتوفر سيولة مقابلة من Binance الآن؛ لن يُرسل أمر السوق حتى يظهر سعر قابل للتنفيذ."
                : orderType === "market"
                  ? "أمر السوق يُرسل إلى Binance للتنفيذ بأفضل الأسعار المتاحة الآن. قد يختلف متوسط التنفيذ عن السعر المعروض، وقد يكون التنفيذ جزئيًا عند نقص السيولة."
                  : side === "buy"
                    ? `شراء محدد: يُرسل الأمر إلى دفتر Binance بسعرك أو بسعر أفضل. تُحجز ${quoteAsset}، ولا تُضاف ${baseAsset} إلى الرصيد إلا بالكمية التي تنفّذ فعلًا؛ وقد يظل الأمر مفتوحًا حتى التنفيذ أو الإلغاء.`
                    : `بيع محدد: يُرسل الأمر إلى دفتر Binance بسعرك أو بسعر أفضل. تُحجز ${baseAsset} من رصيدك حتى التنفيذ أو الإلغاء؛ ولا تُسجل الصفقة إلا بالكمية التي بيعت فعلًا.`}
            </div>
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">أرصدة التداول</h3>
              <Search size={15} className="text-slate-600" />
            </div>
            <div className="space-y-1">
              {balances.slice(0, 8).map((balance, index) => (
                <div
                  key={`${balance.asset}-${index}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2.5 hover:bg-white/[0.03]"
                >
                  <span className="text-xs font-medium">{balance.asset}</span>
                  <div className="text-left">
                    <div className="text-xs">{fmt(balance.available, 8)}</div>
                    {num(balance.locked) > 0 ? (
                      <div className="text-[9px] text-amber-400">مقفل: {fmt(balance.locked, 8)}</div>
                    ) : null}
                  </div>
                </div>
              ))}
              {!balances.length ? (
                <div className="py-5 text-center text-xs text-slate-600">لا توجد أرصدة</div>
              ) : null}
            </div>
          </div>
        </aside>
      </section>

      {loading && (
        <div className="fixed bottom-5 left-5 rounded-lg border border-white/[0.08] bg-[#07101d] px-4 py-2 text-xs text-slate-400 shadow-xl">
          جاري تحميل بيانات التداول...
        </div>
      )}
        </div>
      </div>
    </main>
  );
}