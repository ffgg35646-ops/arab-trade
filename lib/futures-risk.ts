
export function unrealizedPnl(
  side: "long" | "short",
  entryPrice: number,
  markPrice: number,
  quantity: number
) {
  const delta =
    side === "long"
      ? markPrice - entryPrice
      : entryPrice - markPrice;

  return Number((delta * quantity).toFixed(12));
}

export function fundingPayment(
  notional: number,
  fundingRate: number
) {
  return Number((notional * fundingRate).toFixed(12));
}

export function isLiquidatable(
  equity: number,
  maintenanceMargin: number
) {
  return equity <= maintenanceMargin;
}

export function liquidationPrice(
  side: "long" | "short",
  entryPrice: number,
  leverage: number,
  maintenanceRate = 0.005
) {
  if (entryPrice <= 0 || leverage < 1) {
    throw new Error("INVALID_LIQUIDATION_INPUT");
  }

  const move = (1 / leverage) - maintenanceRate;

  if (side === "long") {
    return Number(Math.max(0, entryPrice * (1 - move)).toFixed(12));
  }

  return Number((entryPrice * (1 + move)).toFixed(12));
}