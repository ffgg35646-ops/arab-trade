
export function money(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("INVALID_NUMBER");
  }

  return Number(value.toFixed(12));
}

export function notional(
  price: number,
  quantity: number
) {
  if (price <= 0 || quantity <= 0) {
    throw new Error("INVALID_NOTIONAL");
  }

  return money(price * quantity);
}

export function fee(
  quoteAmount: number,
  feePercent: number
) {
  if (quoteAmount < 0 || feePercent < 0) {
    throw new Error("INVALID_FEE");
  }

  return money(
    quoteAmount * feePercent / 100
  );
}