import { NextRequest } from "next/server";
import { fetchBinanceJson } from "@/lib/binance-market";

export const dynamic = "force-dynamic";

type DepthSnapshot = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

function toRows(rows: [string, string][]) {
  return (Array.isArray(rows) ? rows : [])
    .map(([priceText, quantityText]) => {
      const price = Number(priceText);
      const quantity = Number(quantityText);
      return { price, quantity, amount: price * quantity, total: price * quantity };
    })
    .filter((row) => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.quantity) && row.quantity > 0);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase().replace(/[_/\s-]/g, "");
  const requestedDepth = Number(url.searchParams.get("depth") || 20);
  const depth = Math.min(100, Math.max(5, Number.isFinite(requestedDepth) ? Math.floor(requestedDepth) : 20));

  if (!/^[A-Z0-9]{5,25}$/.test(symbol)) {
    return new Response("invalid symbol", { status: 400 });
  }

  const encoder = new TextEncoder();
  let stopped = false;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (!stopped) {
          try {
            const snapshot = await fetchBinanceJson<DepthSnapshot>(
              "depth?symbol=" + encodeURIComponent(symbol) + "&limit=" + depth,
              1,
            );
            controller.enqueue(encoder.encode("data: " + JSON.stringify({
              source: "binance",
              updatedAt: Date.now(),
              lastUpdateId: snapshot.lastUpdateId,
              bids: toRows(snapshot.bids),
              asks: toRows(snapshot.asks),
            }) + "\n\n"));
          } catch (error) {
            console.error("BINANCE ORDERBOOK STREAM SNAPSHOT:", error);
            controller.enqueue(encoder.encode("event: market-error\ndata: " + JSON.stringify({
              source: "binance",
              message: "تعذر تحديث دفتر Binance مؤقتًا",
              updatedAt: Date.now(),
            }) + "\n\n"));
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        try { controller.error(error); } catch {}
      }
    },
    cancel() {
      stopped = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
