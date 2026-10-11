
export function calculateBorrowed(
  price: number,
  quantity: number,
  leverage: number
) {
  if (price <= 0 || quantity <= 0 || leverage < 1) {
    throw new Error("INVALID_MARGIN_INPUT");
  }

  const notional = price * quantity;
  const margin = notional / leverage;

  return Number(
    Math.max(
      0,
      notional - margin
    ).toFixed(12)
  );
}

export function calculateInterest(
  principal: number,
  annualRate: number,
  elapsedHours: number
) {
  if (
    principal < 0 ||
    annualRate < 0 ||
    elapsedHours < 0
  ) {
    throw new Error("INVALID_INTEREST");
  }

  return Number(
    (
      principal *
      (annualRate / 100) *
      (elapsedHours / 8760)
    ).toFixed(12)
  );
}

export function calculateRatio(
  equity: number,
  borrowed: number
) {
  if (borrowed <= 0) return Infinity;

  return Number(
    (equity / borrowed).toFixed(12)
  );
}

export function liquidatable(
  equity: number,
  borrowed: number,
  maintenanceRatio = 1.1
) {
  return calculateRatio(
    equity,
    borrowed
  ) <= maintenanceRatio;
}