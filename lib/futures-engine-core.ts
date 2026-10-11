
export function validateLeverage(
  leverage: number
) {
  if (
    !Number.isFinite(leverage) ||
    leverage < 1 ||
    leverage > 125
  ) {
    throw new Error("INVALID_LEVERAGE");
  }

  return leverage;
}

export function calculateNotional(
  price: number,
  quantity: number
) {
  if (price <= 0 || quantity <= 0) {
    throw new Error("INVALID_NOTIONAL");
  }

  return price * quantity;
}

export function calculateInitialMargin(
  price: number,
  quantity: number,
  leverage: number
) {
  validateLeverage(leverage);

  return Number(
    (
      calculateNotional(price, quantity) /
      leverage
    ).toFixed(12)
  );
}

export function calculateMaintenanceMargin(
  notional: number,
  rate = 0.005
) {
  return Number(
    (Math.max(0, notional) * rate).toFixed(12)
  );
}

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

  return Number(
    (delta * quantity).toFixed(12)
  );
}

export function calculateLiquidationPrice(
  side: "long" | "short",
  entryPrice: number,
  leverage: number,
  maintenanceRate = 0.005
) {
  validateLeverage(leverage);

  const effective =
    (1 / leverage) + maintenanceRate;

  if (side === "long") {
    return Number(
      Math.max(
        0,
        entryPrice * (1 - effective)
      ).toFixed(12)
    );
  }

  return Number(
    (
      entryPrice *
      (1 + effective)
    ).toFixed(12)
  );
}

export function shouldLiquidate(
  equity: number,
  maintenanceMargin: number
) {
  return equity <= maintenanceMargin;
}

export function calculateFundingPayment(
  notional: number,
  fundingRate: number
) {
  return Number(
    (notional * fundingRate).toFixed(12)
  );
}


export function calculateFuturesPnl(
  side: "long" | "short",
  entryPrice: number,
  markPrice: number,
  quantity: number
) {
  return calculatePnl(
    side,
    entryPrice,
    markPrice,
    quantity
  );
}