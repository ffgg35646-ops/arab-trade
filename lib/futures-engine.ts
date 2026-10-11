
export function calculateFuturesPnl(
  side: "long" | "short",
  entryPrice: number,
  markPrice: number,
  quantity: number
) {
  if (
    entryPrice <= 0 ||
    markPrice <= 0 ||
    quantity <= 0
  ) {
    throw new Error("INVALID_FUTURES_INPUT");
  }

  const difference =
    side === "long"
      ? markPrice - entryPrice
      : entryPrice - markPrice;

  return Number((difference * quantity).toFixed(12));
}

export function calculateMaintenanceMargin(
  notional: number,
  rate = 0.005
) {
  if (notional < 0 || rate < 0) {
    throw new Error("INVALID_MAINTENANCE_MARGIN");
  }

  return Number((notional * rate).toFixed(12));
}

export function shouldLiquidate(
  equity: number,
  maintenanceMargin: number
) {
  return equity <= maintenanceMargin;
}