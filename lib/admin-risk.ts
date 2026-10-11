export type AdminRiskAction =
  | "withdrawal_approve"
  | "withdrawal_reject"
  | "asset_change"
  | "trading_settings_change"
  | "user_status_change"
  | "manual_balance_change";

export type RiskDecision = {
  allowed: boolean;
  level: "low" | "medium" | "high" | "critical";
  reason: string;
};

const HIGH_RISK: AdminRiskAction[] = [
  "withdrawal_approve",
  "trading_settings_change",
  "manual_balance_change",
];

const MEDIUM_RISK: AdminRiskAction[] = [
  "asset_change",
  "user_status_change",
];

export function evaluateAdminRisk(
  action: AdminRiskAction,
  context?: {
    amount?: number;
    currency?: string;
    targetUserId?: string;
  }
): RiskDecision {
  if (
    context?.amount !== undefined &&
    (!Number.isFinite(context.amount) ||
      context.amount < 0)
  ) {
    return {
      allowed: false,
      level: "critical",
      reason: "Invalid financial amount",
    };
  }

  if (HIGH_RISK.includes(action)) {
    if (
      context?.amount !== undefined &&
      context.amount > 1_000_000
    ) {
      return {
        allowed: false,
        level: "critical",
        reason: "Amount exceeds administrative risk threshold",
      };
    }

    return {
      allowed: true,
      level: "high",
      reason: "High-risk administrative action",
    };
  }

  if (MEDIUM_RISK.includes(action)) {
    return {
      allowed: true,
      level: "medium",
      reason: "Medium-risk administrative action",
    };
  }

  return {
    allowed: true,
    level: "low",
    reason: "Normal administrative action",
  };
}
