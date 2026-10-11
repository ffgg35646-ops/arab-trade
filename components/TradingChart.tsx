"use client";

import { useEffect, useRef, useState } from "react";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function makeInitialCandles(): Candle[] {
  let price = 104250;

  return Array.from({ length: 70 }, (_, i) => {
    const open = price;
    const move = (Math.random() - 0.47) * 950;
    const close = open + move;

    const high = Math.max(open, close) + Math.random() * 420;
    const low = Math.min(open, close) - Math.random() * 420;

    price = close;

    return {
      time: Date.now() - (70 - i) * 60000,
      open,
      high,
      low,
      close,
    };
  });
}

export default function TradingChart() {
  const [candles, setCandles] = useState<Candle[]>(makeInitialCandles);
  const [livePrice, setLivePrice] = useState(0);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setLivePrice(candles[candles.length - 1].close);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCandles((old) => {
        const list = [...old];
        const previous = list[list.length - 1];

        const open = previous.close;

        const drift = (Math.random() - 0.49) * 180;
        const close = open + drift;

        const high = Math.max(open, close) + Math.random() * 100;
        const low = Math.min(open, close) - Math.random() * 100;

        const next: Candle = {
          time: Date.now(),
          open,
          high,
          low,
          close,
        };

        setLivePrice(close);
        setDirection(close >= open ? "up" : "down");

        list.push(next);

        if (list.length > 75) {
          list.shift();
        }

        return list;
      });
    }, 900);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);

      const padding = {
        top: 20,
        right: 78,
        bottom: 35,
        left: 12,
      };

      const chartWidth =
        width - padding.left - padding.right;

      const chartHeight =
        height - padding.top - padding.bottom;

      const prices = candles.flatMap((c) => [
        c.high,
        c.low,
      ]);

      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);

      const range = maxPrice - minPrice || 1;

      const y = (price: number) =>
        padding.top +
        ((maxPrice - price) / range) *
          chartHeight;

      const candleWidth =
        Math.max(5, chartWidth / candles.length * 0.62);

      const gap =
        chartWidth / candles.length;

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 1;

      for (let i = 0; i <= 6; i++) {
        const yy =
          padding.top +
          (chartHeight / 6) * i;

        ctx.beginPath();
        ctx.moveTo(padding.left, yy);
        ctx.lineTo(width - padding.right, yy);
        ctx.stroke();

        const value =
          maxPrice -
          (range / 6) * i;

        ctx.fillStyle = "rgba(148,163,184,0.65)";
        ctx.font = "11px Arial";
        ctx.textAlign = "left";

        ctx.fillText(
          value.toFixed(0),
          width - padding.right + 10,
          yy + 4
        );
      }

      // Candles
      candles.forEach((candle, index) => {
        const x =
          padding.left +
          index * gap +
          gap / 2;

        const openY = y(candle.open);
        const closeY = y(candle.close);
        const highY = y(candle.high);
        const lowY = y(candle.low);

        const bullish =
          candle.close >= candle.open;

        const color = bullish
          ? "#22c55e"
          : "#ef4444";

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3;

        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        // Body
        const bodyTop =
          Math.min(openY, closeY);

        const bodyHeight =
          Math.max(
            2,
            Math.abs(closeY - openY)
          );

        ctx.fillStyle = color;

        ctx.fillRect(
          x - candleWidth / 2,
          bodyTop,
          candleWidth,
          bodyHeight
        );
      });

      // Current price line
      const last =
        candles[candles.length - 1];

      const priceY = y(last.close);

      ctx.strokeStyle =
        direction === "up"
          ? "rgba(34,197,94,0.7)"
          : "rgba(239,68,68,0.7)";

      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(
        padding.left,
        priceY
      );
      ctx.lineTo(
        width - padding.right,
        priceY
      );
      ctx.stroke();
      ctx.setLineDash([]);

      // Price label
      ctx.fillStyle =
        direction === "up"
          ? "#22c55e"
          : "#ef4444";

      ctx.fillRect(
        width - padding.right + 2,
        priceY - 11,
        72,
        22
      );

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";

      ctx.fillText(
        Math.round(last.close).toLocaleString(),
        width - 42,
        priceY + 4
      );
    };

    draw();

    const resize = () => draw();

    window.addEventListener(
      "resize",
      resize
    );

    return () =>
      window.removeEventListener(
        "resize",
        resize
      );
  }, [candles, direction]);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#050a13]">

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4">

        <div className="flex items-center gap-4">

          <div>
            <div className="text-lg font-bold text-white">
              BTC/USDT
            </div>

            <div className="text-xs text-slate-500">
              Bitcoin / Tether
            </div>
          </div>

          <div
            className={
              direction === "up"
                ? "text-lg font-bold text-green-400"
                : "text-lg font-bold text-red-400"
            }
          >
            ${livePrice.toLocaleString(
              undefined,
              {
                maximumFractionDigits: 0,
              }
            )}
          </div>

        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">

          {["1m", "5m", "15m", "1H", "4H", "1D"].map(
            (item, index) => (
              <button
                key={item}
                className={
                  index === 0
                    ? "rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300"
                    : "rounded-lg px-3 py-1.5 text-xs text-slate-500 transition hover:bg-white/5 hover:text-white"
                }
              >
                {item}
              </button>
            )
          )}

        </div>

      </div>

      <div className="relative h-[430px] w-full">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />

        <div className="pointer-events-none absolute left-5 top-4 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] text-slate-500 backdrop-blur">
          LIVE MARKET
        </div>

      </div>

    </div>
  );
}