
export function calculateMarginInterest(
  principal: number,
  annualRate: number,
  elapsedHours: number
) {
  if (
    !Number.isFinite(principal) ||
    principal < 0 ||
    !Number.isFinite(annualRate) ||
    annualRate < 0 ||
    !Number.isFinite(elapsedHours) ||
    elapsedHours < 0
  ) {
    throw new Error("INVALID_INTEREST_INPUT");
  }

  return Number(
    (principal * (annualRate / 100) * (elapsedHours / 8760)).toFixed(12)
  );
}