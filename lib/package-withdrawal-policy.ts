export const roundWithdrawal = (n: number) => Math.round((n + Number.EPSILON) * 1e8) / 1e8;
/** Referrals authorize a ceiling; they never credit the actual package balance. */
export function withdrawalAllowance(activation: number, activeReferralDeposits: number, used: number) {
 return roundWithdrawal(Math.max(0, roundWithdrawal(activation) + roundWithdrawal(activeReferralDeposits * 0.5) - roundWithdrawal(used)));
}
export function availableToWithdraw(balance: number, allowance: number) {
 return roundWithdrawal(Math.max(0, Math.min(balance, allowance)));
}
export function validateWithdrawal(amount: number, minimum: number, balance: number, allowance: number): string | null {
 if (!Number.isFinite(amount) || amount <= 0 || roundWithdrawal(amount) !== amount) return "مبلغ السحب غير صالح";
 if (amount < minimum) return "الحد الأدنى للسحب هو " + minimum + " USDT";
 if (balance < minimum) return "رصيد سحب الباقة أقل من الحد الأدنى " + minimum + " USDT";
 const available = availableToWithdraw(balance, allowance);
 if (amount > available) return available > 0 ? "المتاح للسحب " + available + " USDT فقط" : "طاقة السحب من هذه الباقة منخفضة؛ لابد من جلب إحالات نشطة جديدة";
 return null;
}
