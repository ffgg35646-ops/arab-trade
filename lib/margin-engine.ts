
export function calculateMarginPnl(
  side: "long" | "short",
  entryPrice: number,
  currentPrice: number,
  quantity: number
) {
  if (
    entryPrice <= 0 ||
    currentPrice <= 0 ||
    quantity <= 0
  ) {
    throw new Error("INVALID_MARGIN_INPUT");
  }

  const difference =
    side === "long"
      ? currentPrice - entryPrice
      : entryPrice - currentPrice;

  return Number((difference * quantity).toFixed(12));
}

export function calculateMarginRatio(
  equity: number,
  borrowed: number
) {
  if (borrowed <= 0) return Infinity;

  return Number((equity / borrowed).toFixed(12));
}

export function isMarginLiquidatable(
  equity: number,
  borrowed: number,
  threshold = 1.1
) {
  if (borrowed <= 0) return false;

  return calculateMarginRatio(equity, borrowed) <= threshold;
}