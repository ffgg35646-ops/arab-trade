
export function validateSpotFill(
  price: number,
  quantity: number
) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("INVALID_FILL_PRICE");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("INVALID_FILL_QUANTITY");
  }

  return Number((price * quantity).toFixed(12));
}

export function calculateSpotFee(
  quoteAmount: number,
  feePercent: number
) {
  if (quoteAmount < 0 || feePercent < 0) {
    throw new Error("INVALID_FEE_INPUT");
  }

  return Number(
    (quoteAmount * feePercent / 100).toFixed(12)
  );
}