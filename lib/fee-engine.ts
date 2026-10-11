
export function calculateTradingFee(
  quoteAmount: number,
  feePercent: number
) {
  if (!Number.isFinite(quoteAmount) || quoteAmount < 0) {
    throw new Error("INVALID_QUOTE_AMOUNT");
  }

  if (!Number.isFinite(feePercent) || feePercent < 0) {
    throw new Error("INVALID_FEE_PERCENT");
  }

  return Number((quoteAmount * feePercent / 100).toFixed(12));
}

export function calculateReceiveAmount(
  amount: number,
  fee: number
) {
  return Number(Math.max(0, amount - fee).toFixed(12));
}