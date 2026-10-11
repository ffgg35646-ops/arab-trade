import Order from "@/models/Order";
import Trade from "@/models/Trade";

type Mode = "demo" | "live";

export async function buildOrderBook(
  symbol: string,
  mode: Mode = "live",
  depth = 20
) {
  const normalized =
    String(symbol || "")
      .trim()
      .toUpperCase();

  const safeDepth = Math.min(
    Math.max(
      Number.isFinite(depth)
        ? Math.floor(depth)
        : 20,
      1
    ),
    100
  );

  const orders = await Order.find({
    symbol: normalized,
    mode,
    type: "limit",
    status: "open",
    quantity: { $gt: 0 },
  })
    .select(
      "side price quantity createdAt"
    )
    .sort({
      price: 1,
      createdAt: 1,
    })
    .lean();

  const bidMap = new Map<
    number,
    number
  >();

  const askMap = new Map<
    number,
    number
  >();

  for (const order of orders) {
    const price = Number(order.price);
    const quantity = Number(order.quantity);

    if (
      !Number.isFinite(price) ||
      !Number.isFinite(quantity) ||
      price <= 0 ||
      quantity <= 0
    ) {
      continue;
    }

    const map =
      order.side === "buy"
        ? bidMap
        : askMap;

    map.set(
      price,
      Number(
        (
          Number(map.get(price) || 0) +
          quantity
        ).toFixed(12)
      )
    );
  }

  const bids = Array.from(
    bidMap.entries()
  )
    .sort((a, b) => b[0] - a[0])
    .slice(0, safeDepth)
    .map(([price, quantity]) => ({
      price,
      quantity,
      quoteAmount: Number(
        (price * quantity).toFixed(12)
      ),
    }));

  const asks = Array.from(
    askMap.entries()
  )
    .sort((a, b) => a[0] - b[0])
    .slice(0, safeDepth)
    .map(([price, quantity]) => ({
      price,
      quantity,
      quoteAmount: Number(
        (price * quantity).toFixed(12)
      ),
    }));

  const bestBid =
    bids.length > 0
      ? bids[0].price
      : null;

  const bestAsk =
    asks.length > 0
      ? asks[0].price
      : null;

  const spread =
    bestBid !== null &&
    bestAsk !== null
      ? Number(
          (bestAsk - bestBid).toFixed(12)
        )
      : null;

  const lastTrade =
    await Trade.findOne({
      symbol: normalized,
      mode,
    })
      .sort({
        createdAt: -1,
      })
      .select(
        "price quantity quoteAmount createdAt"
      )
      .lean();

  return {
    symbol: normalized,
    mode,
    bids,
    asks,
    bestBid,
    bestAsk,
    spread,
    lastPrice:
      lastTrade
        ? Number(lastTrade.price)
        : null,
    lastQuantity:
      lastTrade
        ? Number(lastTrade.quantity)
        : null,
    lastQuoteAmount:
      lastTrade
        ? Number(lastTrade.quoteAmount)
        : null,
    lastTradeAt:
      lastTrade?.createdAt || null,
    updatedAt:
      new Date(),
  };
}
