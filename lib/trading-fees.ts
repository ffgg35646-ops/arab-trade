
export function calcTradingFee(
  quoteAmount: number,
  feePercent: number
) {
  const base = Math.max(0, Number(quoteAmount) || 0);
  const pct = Math.max(0, Number(feePercent) || 0);
  return Number((base * pct / 100).toFixed(12));
}