
export function validateLimitOrder(
  price: number,
  quantity: number,
  minAmount: number,
  maxAmount: number
) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("INVALID_PRICE");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("INVALID_QUANTITY");
  }

  const quoteAmount = price * quantity;

  if (quoteAmount < minAmount) {
    throw new Error("ORDER_BELOW_MINIMUM");
  }

  if (maxAmount > 0 && quoteAmount > maxAmount) {
    throw new Error("ORDER_ABOVE_MAXIMUM");
  }

  return quoteAmount;
}