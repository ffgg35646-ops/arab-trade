
export function validateWithdrawalAddress(
  address: string
) {
  const value = String(address || "").trim();

  if (!value) {
    throw new Error("INVALID_WITHDRAWAL_ADDRESS");
  }

  if (value.length < 20) {
    throw new Error("INVALID_WITHDRAWAL_ADDRESS");
  }

  return value;
}

export function validateWithdrawalAmount(
  amount: number,
  minimum: number,
  maximum: number
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_WITHDRAWAL_AMOUNT");
  }

  if (amount < minimum) {
    throw new Error("WITHDRAWAL_BELOW_MINIMUM");
  }

  if (maximum > 0 && amount > maximum) {
    throw new Error("WITHDRAWAL_ABOVE_MAXIMUM");
  }

  return amount;
}