export const roundWithdrawal = (n: number) => Math.round((n + Number.EPSILON) * 1e8) / 1e8;

/**
 * First withdrawal phase:
 * the daily allowance is limited to the first activation/deposit amount for this package.
 * Approved and pending withdrawals consume today's cap; rejected requests do not.
 * Collected profits and cancellation refunds increase the package balance, not this allowance.
 * Any separate rule for withdrawing beyond this daily cap is intentionally left out until defined.
 */
export function withdrawalAllowance(activation: number, used: number) {
  return roundWithdrawal(Math.max(0, Number(activation || 0) - Math.max(0, Number(used || 0))));
}

export function availableToWithdraw(balance: number, allowance: number) {
  return roundWithdrawal(Math.max(0, Math.min(balance, allowance)));
}

export function validateWithdrawal(amount: number, minimum: number, balance: number, allowance: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0 || roundWithdrawal(amount) !== amount) return "مبلغ السحب غير صالح";
  if (amount < minimum) return "الحد الأدنى للسحب هو " + minimum + " USDT";
  if (balance < minimum) return "رصيد سحب الباقة أقل من الحد الأدنى " + minimum + " USDT";
  const available = availableToWithdraw(balance, allowance);
  if (amount > available) {
    return available > 0
      ? "المتاح للسحب " + available + " USDT فقط"
      : "تم استنفاد حد السحب اليومي لهذه الباقة";
  }
  return null;
}
