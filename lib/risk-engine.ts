
export function calculatePnl(
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

export function calculateNotional(
  price: number,
  quantity: number
) {
  return Number((Math.max(0, price) * Math.max(0, quantity)).toFixed(12));
}

export function calculateMargin(
  notional: number,
  leverage: number
) {
  if (!Number.isFinite(leverage) || leverage <= 0) {
    throw new Error("INVALID_LEVERAGE");
  }

  return Number((notional / leverage).toFixed(12));
}

export function calculateLiquidationPrice(
  side: "long" | "short",
  entryPrice: number,
  leverage: number,
  maintenanceRate = 0.005
) {
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(leverage) ||
    leverage < 1
  ) {
    throw new Error("INVALID_RISK_INPUT");
  }

  const move = (1 / leverage) * 0.9 + maintenanceRate;

  if (side === "long") {
    return Number(
      Math.max(0, entryPrice * (1 - move)).toFixed(12)
    );
  }

  return Number(
    (entryPrice * (1 + move)).toFixed(12)
  );
}

export function marginRatio(
  equity: number,
  borrowed: number
) {
  if (borrowed <= 0) return Infinity;

  return Number((equity / borrowed).toFixed(12));
}