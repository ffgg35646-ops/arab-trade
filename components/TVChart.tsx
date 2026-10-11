"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Kline = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function formatPrice(price: number) {
  if (!Number.isFinite(price)) return "--";

  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
  }

  if (price >= 1) {
    return price.toLocaleString("en-US", {
      maximumFractionDigits: 4,
    });
  }

  return price.toLocaleString("en-US", {
    maximumFractionDigits: 8,
    useGrouping: false,
  });
}

function normalizeKlineRow(row: any): Candle | null {
  if (!Array.isArray(row) || row.length < 6) {
    return null;
  }

  const time = Number(row[0]);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);

  if (
    !Number.isFinite(time) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
  };
}

export default function TVChart({
  symbol,
}: {
  symbol: string;
}) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [interval, setIntervalValue] = useState("1m");

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);

  const cleanSymbol = useMemo(() => {
    return symbol
      .replace("/", "")
      .replace("_", "")
      .replace("-", "")
      .trim()
      .toUpperCase();
  }, [symbol]);

  useEffect(() => {
    destroyedRef.current = false;
    setCandles([]);
    setPrice(null);

    async function loadHistorical() {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${interval}&limit=200`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) return;

        const data = await response.json();

        if (destroyedRef.current || !Array.isArray(data)) {
          return;
        }

        const parsed = data
          .map(normalizeKlineRow)
          .filter(Boolean) as Candle[];

        if (!parsed.length) return;

        setCandles(parsed);

        const last = parsed[parsed.length - 1];

        if (last) {
          setPrice(last.close);
        }
      } catch {
        // لا نعرض خطأ للمستخدم
      }
    }

    function connect() {
      if (destroyedRef.current) return;

      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {}
      }

      const ws = new WebSocket(
        `wss://stream.binance.com:9443/ws/${cleanSymbol.toLowerCase()}@kline_${interval}`
      );

      socketRef.current = ws;

      ws.onmessage = (event) => {
        if (destroyedRef.current) return;

        try {
          const data = JSON.parse(event.data);
          const k = data?.k;

          if (!k) return;

          const next: Kline = {
            time: Number(k.t),
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
          };

          if (
            !Number.isFinite(next.time) ||
            !Number.isFinite(next.open) ||
            !Number.isFinite(next.high) ||
            !Number.isFinite(next.low) ||
            !Number.isFinite(next.close)
          ) {
            return;
          }

          setPrice(next.close);

          setCandles((previous) => {
            const copy = [...previous];
            const last = copy[copy.length - 1];

            if (last && last.time === next.time) {
              copy[copy.length - 1] = next;
            } else {
              copy.push(next);
            }

            return copy.slice(-200);
          });
        } catch {
          // تجاهل الرسائل غير الصالحة
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (destroyedRef.current) return;

        reconnectRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    }

    void loadHistorical();
    connect();

    return () => {
      destroyedRef.current = true;

      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {}
      }

      socketRef.current = null;
    };
  }, [cleanSymbol, interval]);

  const chart = useMemo(() => {
    if (!candles.length) {
      return {
        min: 0,
        max: 1,
        width: 1000,
        height: 430,
      };
    }

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    const max = Math.max(...highs);
    const min = Math.min(...lows);

    const difference = max - min;

    const padding =
      difference > 0
        ? difference * 0.08
        : Math.max(Math.abs(max) * 0.002, 0.00000001);

    return {
      min: min - padding,
      max: max + padding,
      width: 1000,
      height: 430,
    };
  }, [candles]);

  const candleWidth = useMemo(() => {
    if (candles.length < 2) return 8;

    return Math.max(
      3,
      Math.min(12, chart.width / candles.length * 0.62)
    );
  }, [candles.length, chart.width]);

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden bg-[#050a13]">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-x-0 top-[20%] border-t border-white/5" />
        <div className="absolute inset-x-0 top-[40%] border-t border-white/5" />
        <div className="absolute inset-x-0 top-[60%] border-t border-white/5" />
        <div className="absolute inset-x-0 top-[80%] border-t border-white/5" />

        <div className="absolute inset-y-0 left-[20%] border-l border-white/5" />
        <div className="absolute inset-y-0 left-[40%] border-l border-white/5" />
        <div className="absolute inset-y-0 left-[60%] border-l border-white/5" />
        <div className="absolute inset-y-0 left-[80%] border-l border-white/5" />
      </div>

      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        {["1m", "5m", "15m", "1h", "4h", "1d"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setIntervalValue(item)}
            className={
              interval === item
                ? "rounded-md bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300"
                : "rounded-md px-2.5 py-1.5 text-[11px] text-slate-500 hover:bg-white/5 hover:text-white"
            }
          >
            {item}
          </button>
        ))}
      </div>

      <div className="absolute right-5 top-5 z-20">
        <div className="text-[11px] text-slate-500">
          السعر الحالي
        </div>

        <div className="mt-1 text-2xl font-bold text-white">
          {price ? `$${formatPrice(price)}` : "--"}
        </div>

        <div className="mt-1 text-xs font-semibold text-cyan-400">
          {cleanSymbol}
        </div>
      </div>

      <div className="absolute inset-x-4 bottom-10 top-16 overflow-hidden">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="h-full w-full"
          preserveAspectRatio="none"
        >
          {candles.map((candle, index) => {
            const x =
              ((index + 0.5) / Math.max(candles.length, 1)) *
              chart.width;

            const range = chart.max - chart.min || 1;

            const y = (value: number) =>
              chart.height -
              ((value - chart.min) / range) *
                (chart.height - 30) -
              15;

            const openY = y(candle.open);
            const closeY = y(candle.close);
            const highY = y(candle.high);
            const lowY = y(candle.low);

            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(
              1,
              Math.abs(closeY - openY)
            );

            const up = candle.close >= candle.open;

            return (
              <g key={`${candle.time}-${index}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={highY}
                  y2={lowY}
                  stroke={up ? "#34d399" : "#fb7185"}
                  strokeWidth="1"
                />

                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  rx="1"
                  fill={up ? "#10b981" : "#f43f5e"}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="absolute bottom-3 left-5 right-5 flex items-center justify-between text-[10px] text-slate-600">
        <span>Binance Spot • Live Kline</span>
        <span>{candles.length} شمعة</span>
      </div>
    </div>
  );
}
