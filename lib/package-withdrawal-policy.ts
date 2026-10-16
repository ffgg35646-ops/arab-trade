export const roundWithdrawal = (n: number) => Math.round((n + Number.EPSILON) * 1e8) / 1e8;

/**
 * The one-time base withdrawal allowance equals the package's first activation amount.
 * Pending and approved package withdrawals consume it cumulatively; rejected requests do not.
 */
export function withdrawalAllowance(activation: number, alreadyWithdrawn: number) {
  return roundWithdrawal(Math.max(0, Number(activation || 0) - Math.max(0, Number(alreadyWithdrawn || 0))));
}

/**
 * Additional cumulative withdrawal capacity unlocked by qualifying deposits from active referrals.
 * Pending and approved referral-backed withdrawals consume this capacity; rejected requests do not.
 */
export function referralWithdrawalAllowance(referralDeposits: number, percent: number, alreadyUsed: number) {
  const depositTotal = Math.max(0, Number(referralDeposits || 0));
  const rate = Math.min(100, Math.max(0, Number(percent || 0)));
  const earnedCapacity = roundWithdrawal(depositTotal * rate / 100);
  return roundWithdrawal(Math.max(0, earnedCapacity - Math.max(0, Number(alreadyUsed || 0))));
}

export function totalWithdrawalAllowance(baseRemaining: number, referralRemaining: number) {
  return roundWithdrawal(Math.max(0, Number(baseRemaining || 0)) + Math.max(0, Number(referralRemaining || 0)));
}

export function availableToWithdraw(balance: number, allowance: number) {
  return roundWithdrawal(Math.max(0, Math.min(balance, allowance)));
}

export function validateWithdrawal(
  amount: number,
  minimum: number,
  balance: number,
  allowance: number,
  referralRequired = false,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0 || roundWithdrawal(amount) !== amount) return "مبلغ السحب غير صالح";
  if (amount < minimum) return "الحد الأدنى للسحب هو " + minimum + " USDT";
  if (balance < minimum) return "رصيد سحب الباقة أقل من الحد الأدنى " + minimum + " USDT";
  const available = availableToWithdraw(balance, allowance);
  if (amount > available) {
    if (available > 0) return "المتاح للسحب " + available + " USDT فقط";
    if (referralRequired) return "تم استنفاد حد السحب؛ يلزم وجود إحالات نشطة بإيداعات معتمدة إضافية لفتح سعة جديدة";
    return "تم استنفاد حد السحب الأساسي لهذه الباقة";
  }
  return null;
}
