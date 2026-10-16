import Wallet from "@/models/Wallet";
import Order from "@/models/Order";
import Trade from "@/models/Trade";
import DepositRequest from "@/models/DepositRequest";
import LedgerEntry from "@/models/LedgerEntry";

type Issue = {
  severity: "error" | "warning";
  category: string;
  message: string;
  details?: Record<string, unknown>;
};

export async function runReconciliation() {
  const issues: Issue[] = [];

  const [
    wallets,
    orders,
    trades,
    deposits,
  ] = await Promise.all([
    Wallet.find({}).lean(),
    Order.find({}).lean(),
    Trade.find({}).lean(),
    DepositRequest.find({}).lean(),
  ]);

  // ----------------------------------------------------------
  // Wallet checks
  // ----------------------------------------------------------
  let walletCount = 0;

  for (const wallet of wallets as any[]) {
    walletCount += 1;

    if (!["demo", "live"].includes(String(wallet.mode))) {
      issues.push({
        severity: "error",
        category: "wallet",
        message: "Wallet has invalid mode",
        details: {
          walletId: String(wallet._id),
          mode: wallet.mode,
        },
      });
    }

    for (const balance of wallet.balances || []) {
      const available = Number(balance.available || 0);
      const locked = Number(balance.locked || 0);

      if (!Number.isFinite(available) || !Number.isFinite(locked)) {
        issues.push({
          severity: "error",
          category: "wallet",
          message: "Wallet contains non-finite balance",
          details: {
            walletId: String(wallet._id),
            asset: balance.asset,
          },
        });
        continue;
      }

      if (available < 0 || locked < 0) {
        issues.push({
          severity: "error",
          category: "wallet",
          message: "Wallet contains negative balance",
          details: {
            walletId: String(wallet._id),
            asset: balance.asset,
            available,
            locked,
          },
        });
      }
    }
  }

  // ----------------------------------------------------------
  // Order checks
  // ----------------------------------------------------------
  let openOrders = 0;
  let filledOrders = 0;
  let cancelledOrders = 0;

  const orderById = new Map<string, any>();

  for (const order of orders as any[]) {
    const id = String(order._id);
    orderById.set(id, order);

    const quantity = Number(order.quantity || 0);
    const original =
      order.originalQuantity == null
        ? null
        : Number(order.originalQuantity);

    const filled =
      order.filledQuantity == null
        ? null
        : Number(order.filledQuantity);

    if (!["demo", "live"].includes(String(order.mode))) {
      issues.push({
        severity: "error",
        category: "order",
        message: "Order has invalid mode",
        details: {
          orderId: id,
          mode: order.mode,
        },
      });
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      issues.push({
        severity: "error",
        category: "order",
        message: "Order has invalid remaining quantity",
        details: {
          orderId: id,
          quantity,
        },
      });
    }

    if (original != null && (!Number.isFinite(original) || original < 0)) {
      issues.push({
        severity: "error",
        category: "order",
        message: "Order has invalid original quantity",
        details: {
          orderId: id,
          originalQuantity: original,
        },
      });
    }

    if (filled != null && (!Number.isFinite(filled) || filled < 0)) {
      issues.push({
        severity: "error",
        category: "order",
        message: "Order has invalid filled quantity",
        details: {
          orderId: id,
          filledQuantity: filled,
        },
      });
    }

    if (
      original != null &&
      filled != null &&
      filled - original > 1e-10
    ) {
      issues.push({
        severity: "error",
        category: "order",
        message: "Filled quantity is greater than original quantity",
        details: {
          orderId: id,
          originalQuantity: original,
          filledQuantity: filled,
        },
      });
    }

    if (order.status === "open") openOrders += 1;
    if (order.status === "filled") filledOrders += 1;
    if (order.status === "cancelled") cancelledOrders += 1;

    if (
      order.status === "open" &&
      quantity <= 0
    ) {
      issues.push({
        severity: "error",
        category: "order",
        message: "Open order has zero remaining quantity",
        details: {
          orderId: id,
          quantity,
        },
      });
    }

    if (
      order.status === "filled" &&
      quantity > 1e-10
    ) {
      issues.push({
        severity: "warning",
        category: "order",
        message: "Filled order still has remaining quantity",
        details: {
          orderId: id,
          quantity,
        },
      });
    }
  }

  // ----------------------------------------------------------
  // Trade checks + order fill totals
  // ----------------------------------------------------------
  const boughtByOrder = new Map<string, number>();
  const soldByOrder = new Map<string, number>();

  let tradeCount = 0;

  for (const trade of trades as any[]) {
    tradeCount += 1;

    const quantity = Number(trade.quantity || 0);
    const quoteAmount = Number(trade.quoteAmount || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      issues.push({
        severity: "error",
        category: "trade",
        message: "Trade has invalid quantity",
        details: {
          tradeId: String(trade._id),
          quantity,
        },
      });
    }

    if (!Number.isFinite(quoteAmount) || quoteAmount < 0) {
      issues.push({
        severity: "error",
        category: "trade",
        message: "Trade has invalid quote amount",
        details: {
          tradeId: String(trade._id),
          quoteAmount,
        },
      });
    }

    if (!["demo", "live"].includes(String(trade.mode))) {
      issues.push({
        severity: "error",
        category: "trade",
        message: "Trade has invalid mode",
        details: {
          tradeId: String(trade._id),
          mode: trade.mode,
        },
      });
    }

    const buyId = String(trade.buyOrderId);
    const sellId = String(trade.sellOrderId);

    boughtByOrder.set(
      buyId,
      (boughtByOrder.get(buyId) || 0) + quantity
    );

    soldByOrder.set(
      sellId,
      (soldByOrder.get(sellId) || 0) + quantity
    );

    if (!orderById.has(buyId)) {
      issues.push({
        severity: "error",
        category: "trade",
        message: "Trade references missing buy order",
        details: {
          tradeId: String(trade._id),
          buyOrderId: buyId,
        },
      });
    }

    if (!orderById.has(sellId)) {
      issues.push({
        severity: "error",
        category: "trade",
        message: "Trade references missing sell order",
        details: {
          tradeId: String(trade._id),
          sellOrderId: sellId,
        },
      });
    }
  }

  // Compare accumulated trade quantity against filledQuantity.
  for (const order of orders as any[]) {
    const id = String(order._id);

    const expectedFilled =
      order.filledQuantity == null
        ? null
        : Number(order.filledQuantity);

    if (expectedFilled == null) {
      continue;
    }

    const tradeFilled =
      order.side === "buy"
        ? boughtByOrder.get(id) || 0
        : soldByOrder.get(id) || 0;

    if (Math.abs(tradeFilled - expectedFilled) > 1e-8) {
      issues.push({
        severity: "error",
        category: "trade-order",
        message: "Order filledQuantity does not match trades",
        details: {
          orderId: id,
          expectedFilled,
          tradeFilled,
        },
      });
    }
  }

  // ----------------------------------------------------------
  // Deposit checks
  // ----------------------------------------------------------
  for (const deposit of deposits as any[]) {
    const status = String(deposit.status);
    const credited = Boolean(deposit.creditedAt);

    if (credited && !deposit.txHash) {
      issues.push({
        severity: "error",
        category: "deposit",
        message: "Credited deposit has no txHash",
        details: {
          depositId: String(deposit._id),
        },
      });
    }

    if (
      credited &&
      status !== "completed" &&
      status !== "approved"
    ) {
      issues.push({
        severity: "warning",
        category: "deposit",
        message: "Credited deposit has unexpected status",
        details: {
          depositId: String(deposit._id),
          status,
        },
      });
    }
  }

  const errors =
    issues.filter(
      (item) => item.severity === "error"
    ).length;

  const warnings =
    issues.filter(
      (item) => item.severity === "warning"
    ).length;

  return {
    ok: errors === 0,
    checkedAt: new Date().toISOString(),
    summary: {
      wallets: walletCount,
      orders: orders.length,
      openOrders,
      filledOrders,
      cancelledOrders,
      trades: tradeCount,
      deposits: deposits.length,
      errors,
      warnings,
    },
    issues,
  };
}
