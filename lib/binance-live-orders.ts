import mongoose from "mongoose";
import Order from "@/models/Order";
import Wallet from "@/models/Wallet";
import Trade from "@/models/Trade";
import LedgerEntry from "@/models/LedgerEntry";
import IdempotencyKey from "@/models/IdempotencyKey";
import type { BinanceSpotSymbol } from "@/lib/binance-market";
import {
  BinanceTradingError,
  binanceTradingUnavailableMessage,
  cancelBinanceSpotOrder,
  getBinancePublicPrice,
  isBinanceLiveTradingConfigured,
  placeBinanceSpotOrder,
  queryBinanceSpotOrder,
  type BinanceExecutionOrder,
} from "@/lib/binance-trading";
import { calculateTradingFee } from "@/lib/fee-engine";

const round8 = (value: number) => Number((Math.round((value + Number.EPSILON) * 1e8) / 1e8).toFixed(8));

function filterFor(pair: BinanceSpotSymbol, type: string) {
  return (pair.filters || []).find((filter) => filter.filterType === type);
}

function precisionFromStep(stepValue: unknown) {
  const text = String(stepValue || "");
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.slice(dot + 1).replace(/0+$/, "").length;
}

function floorToStep(value: number, stepValue: unknown) {
  const step = Number(stepValue || 0);
  if (!Number.isFinite(step) || step <= 0) return round8(value);
  const precision = Math.min(12, Math.max(0, precisionFromStep(stepValue)));
  return Number((Math.floor((value + step * 1e-9) / step) * step).toFixed(precision));
}

function ceilToStep(value: number, stepValue: unknown) {
  const step = Number(stepValue || 0);
  if (!Number.isFinite(step) || step <= 0) return round8(value);
  const precision = Math.min(12, Math.max(0, precisionFromStep(stepValue)));
  return Number((Math.ceil((value - step * 1e-9) / step) * step).toFixed(precision));
}

function isTerminal(status: string) {
  return ["FILLED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(status.toUpperCase());
}

function localStatus(status: string): "open" | "cancelled" | "filled" | "rejected" {
  const normalized = status.toUpperCase();
  if (normalized === "FILLED") return "filled";
  if (normalized === "REJECTED") return "rejected";
  if (["CANCELED", "CANCELLED", "EXPIRED"].includes(normalized)) return "cancelled";
  return "open";
}

async function changeWalletBalance(
  session: mongoose.ClientSession,
  userId: mongoose.Types.ObjectId,
  assetValue: string,
  availableDelta: number,
  lockedDelta: number,
) {
  const asset = assetValue.toUpperCase();
  const wallet = await Wallet.findOne({ userId, type: "spot", mode: "live" }).session(session);
  if (!wallet) throw new Error("LIVE_SPOT_WALLET_NOT_FOUND");
  let row: any = (wallet.balances as any[]).find((item) => String(item.asset || "").toUpperCase() === asset);
  if (!row) {
    if (availableDelta < -1e-8 || lockedDelta < -1e-8) throw new Error("INSUFFICIENT_WALLET_BALANCE:" + asset);
    wallet.balances.push({ asset, available: 0, locked: 0 } as any);
    row = (wallet.balances as any[]).find((item) => String(item.asset || "").toUpperCase() === asset);
  }
  const nextAvailable = round8(Number(row.available || 0) + availableDelta);
  const nextLocked = round8(Number(row.locked || 0) + lockedDelta);
  if (nextAvailable < -1e-8 || nextLocked < -1e-8) throw new Error("INSUFFICIENT_WALLET_BALANCE:" + asset);
  row.available = Math.max(0, nextAvailable);
  row.locked = Math.max(0, nextLocked);
  await wallet.save({ session });
}

async function lockWalletBalance(
  session: mongoose.ClientSession,
  userId: mongoose.Types.ObjectId,
  assetValue: string,
  amount: number,
) {
  const asset = assetValue.toUpperCase();
  const wallet = await Wallet.findOne({ userId, type: "spot", mode: "live" }).session(session);
  if (!wallet) throw new Error("LIVE_SPOT_WALLET_NOT_FOUND");
  const row: any = (wallet.balances as any[]).find((item) => String(item.asset || "").toUpperCase() === asset);
  if (!row || Number(row.available || 0) + 1e-8 < amount) {
    throw new Error("INSUFFICIENT_AVAILABLE_BALANCE:" + asset);
  }
  row.available = round8(Number(row.available || 0) - amount);
  row.locked = round8(Number(row.locked || 0) + amount);
  await wallet.save({ session });
}

async function totalWalletBalance(
  session: mongoose.ClientSession,
  userId: mongoose.Types.ObjectId,
  assetValue: string,
) {
  const asset = assetValue.toUpperCase();
  const wallet = await Wallet.findOne({ userId, type: "spot", mode: "live" }).session(session).lean();
  const rows = (wallet?.balances || []).filter((item: any) => String(item.asset || "").toUpperCase() === asset);
  return round8(rows.reduce((sum: number, item: any) => sum + Number(item.available || 0) + Number(item.locked || 0), 0));
}

async function writeUserLedger(
  session: mongoose.ClientSession,
  userId: mongoose.Types.ObjectId,
  asset: string,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  referenceId: string,
  note: string,
  entryType: "trade" | "fee" = "trade",
) {
  if (!Number.isFinite(amount) || Math.abs(amount) < 1e-12) return;
  await LedgerEntry.create([{
    userId,
    scope: "user",
    asset: asset.toUpperCase(),
    mode: "live",
    type: entryType,
    amount,
    balanceBefore: round8(balanceBefore),
    balanceAfter: round8(balanceAfter),
    referenceId,
    note,
  }], { session });
}

async function writeSystemTradingFee(
  session: mongoose.ClientSession,
  amount: number,
  asset: string,
  referenceId: string,
) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const previous = await LedgerEntry.findOne({
    scope: "system", systemAccount: "trading-fees", asset: asset.toUpperCase(), mode: "live",
  }).sort({ createdAt: -1 }).session(session).lean();
  const before = Number(previous?.balanceAfter || 0);
  const after = round8(before + amount);
  await LedgerEntry.create([{
    scope: "system",
    systemAccount: "trading-fees",
    asset: asset.toUpperCase(),
    mode: "live",
    type: "fee",
    amount,
    balanceBefore: before,
    balanceAfter: after,
    referenceId,
    note: "عمولة تداول من تنفيذ Binance Spot",
  }], { session });
}

export type SubmitBinanceOrderInput = {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  quantity: number;
  baseAsset: string;
  quoteAsset: string;
  pair: BinanceSpotSymbol;
  feePercent: number;
  minOrderAmount: number;
  maxOrderAmount: number;
  purpose?: "spot" | "withdrawal-conversion";
  idempotencyKey?: string;
  requestHash?: string;
  idempotencyRoute?: string;
};

export type SubmitBinanceOrderResult = { status: number; body: Record<string, any> };

export async function submitBinanceLiveOrder(input: SubmitBinanceOrderInput): Promise<SubmitBinanceOrderResult> {
  if (!isBinanceLiveTradingConfigured()) {
    return { status: 503, body: { success: false, code: "BINANCE_LIVE_TRADING_NOT_CONFIGURED", message: binanceTradingUnavailableMessage() } };
  }

  const symbol = input.symbol.toUpperCase();
  const base = input.baseAsset.toUpperCase();
  const quote = input.quoteAsset.toUpperCase();
  const lot = (input.type === "market" ? filterFor(input.pair, "MARKET_LOT_SIZE") : filterFor(input.pair, "LOT_SIZE")) ||
    filterFor(input.pair, "LOT_SIZE") || filterFor(input.pair, "MARKET_LOT_SIZE");
  const step = lot?.stepSize || "0.00000001";
  const minQty = Number(lot?.minQty || 0);
  const maxQty = Number(lot?.maxQty || Number.MAX_SAFE_INTEGER);
  const quantity = floorToStep(input.quantity, step);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity < minQty || quantity > maxQty) {
    return { status: 400, body: { success: false, message: "الكمية لا تطابق أقل كمية أو خطوة الكمية المسموحة في Binance لهذا الزوج." } };
  }

  let referencePrice = Number(input.price || 0);
  if (input.type === "market" || !Number.isFinite(referencePrice) || referencePrice <= 0) {
    try {
      referencePrice = await getBinancePublicPrice(symbol);
    } catch {
      return { status: 502, body: { success: false, message: "تعذر الحصول على سعر Binance الحالي؛ لم يتم إرسال الأمر." } };
    }
  }

  const priceFilter = filterFor(input.pair, "PRICE_FILTER");
  const tickSize = priceFilter?.tickSize || "0.00000001";
  let limitPrice = referencePrice;
  if (input.type === "limit") {
    limitPrice = input.side === "buy"
      ? floorToStep(referencePrice, tickSize)
      : ceilToStep(referencePrice, tickSize);
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      return { status: 400, body: { success: false, message: "السعر لا يطابق خطوة السعر المسموحة في Binance." } };
    }
  }

  const marketBuyQuoteAmount = input.type === "market" && input.side === "buy"
    ? floorToStep(quantity * referencePrice, "0.00000001")
    : 0;
  const quoteAmount = input.type === "limit" ? round8(limitPrice * quantity) : marketBuyQuoteAmount || round8(referencePrice * quantity);
  const minNotional = Number(filterFor(input.pair, "NOTIONAL")?.minNotional || filterFor(input.pair, "MIN_NOTIONAL")?.minNotional || 0);
  if (quoteAmount < Math.max(input.minOrderAmount, minNotional) || quoteAmount > input.maxOrderAmount) {
    return { status: 400, body: { success: false, message: "قيمة الأمر بعد تقدير سعر Binance يجب أن تكون بين " + Math.max(input.minOrderAmount, minNotional) + " و " + input.maxOrderAmount + " " + quote + "." } };
  }

  const feePercent = Math.min(100, Math.max(0, Number(input.feePercent || 0)));
  const reservedAmount = input.side === "buy"
    ? round8((input.type === "limit" ? limitPrice * quantity : quoteAmount) * (1 + feePercent / 100))
    : quantity;
  const reserveAsset = input.side === "buy" ? quote : base;
  const orderId = new mongoose.Types.ObjectId();
  const clientOrderId = "AT" + orderId.toString();
  const session = await mongoose.startSession();
  let localOrder: any = null;

  try {
    await session.withTransaction(async () => {
      if (input.idempotencyKey) {
        await IdempotencyKey.create([{
          userId: input.userId,
          key: input.idempotencyKey,
          route: input.idempotencyRoute || "/api/orders",
          requestHash: input.requestHash || "",
          responseStatus: 202,
          responseBody: { success: true, pending: true, message: "تم حجز الرصيد، جارٍ تأكيد الأمر لدى Binance." },
        }], { session });
      }

      await lockWalletBalance(session, input.userId, reserveAsset, reservedAmount);
      localOrder = new Order({
        _id: orderId,
        userId: input.userId,
        mode: "live",
        symbol,
        side: input.side,
        type: input.type,
        price: limitPrice,
        quantity,
        quoteAmount,
        originalQuantity: quantity,
        filledQuantity: 0,
        status: "open",
        purpose: input.purpose || "spot",
        withdrawalConversionStatus: input.purpose === "withdrawal-conversion" ? "pending" : undefined,
        executionProvider: "binance",
        clientOrderId,
        reservedAmount,
        reservedAsset: reserveAsset,
        releasedAmount: 0,
        settledExecutedQuantity: 0,
        settledQuoteQuantity: 0,
        settledFeeAmount: 0,
        feePercent,
      });
      await localOrder.save({ session });
      if (input.idempotencyKey) {
        await IdempotencyKey.updateOne(
          { userId: input.userId, route: input.idempotencyRoute || "/api/orders", key: input.idempotencyKey },
          { $set: { responseBody: { success: true, pending: true, orderId: String(orderId), message: "تم حجز الرصيد، جارٍ تأكيد الأمر لدى Binance." } } },
          { session },
        );
      }
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return { status: 409, body: { success: false, message: "مفتاح الطلب مستخدم بالفعل، حدّث سجل الأوامر قبل المحاولة مجددًا." } };
    }
    const message = String(error?.message || "");
    if (message.startsWith("INSUFFICIENT_AVAILABLE_BALANCE:")) {
      return { status: 409, body: { success: false, message: "الرصيد المتاح غير كافٍ لاحتساب قيمة الأمر ورسوم التداول." } };
    }
    console.error("BINANCE ORDER RESERVATION:", error);
    return { status: 500, body: { success: false, message: "تعذر حجز الرصيد قبل إرسال الأمر." } };
  } finally {
    await session.endSession();
  }

  let exchangeOrder: BinanceExecutionOrder;
  try {
    exchangeOrder = await placeBinanceSpotOrder({
      symbol,
      side: input.side,
      type: input.type,
      quantity,
      quoteOrderQty: input.type === "market" && input.side === "buy" ? marketBuyQuoteAmount : undefined,
      price: limitPrice,
      clientOrderId,
    });
  } catch (placementError: any) {
    // A network timeout is ambiguous: query by the deterministic client ID before unlocking funds.
    try {
      exchangeOrder = await queryBinanceSpotOrder(symbol, clientOrderId);
    } catch (queryError: any) {
      // Only an explicit Binance 4xx rejection proves the order was not placed.
      // A missing query result after a timeout/5xx is ambiguous: keep funds locked
      // rather than releasing funds while an exchange-side order may still exist.
      const definitelyNotPlaced =
        placementError instanceof BinanceTradingError &&
        placementError.status >= 400 &&
        placementError.status < 500 &&
        placementError.code !== undefined;
      if (definitelyNotPlaced) {
        await rejectAndRelease(String(orderId), String(placementError?.message || "رفض Binance الأمر"));
        const body = { success: false, message: String(placementError?.message || "رفض Binance الأمر") };
        await saveFinalIdempotency(input, body, 502);
        return { status: 502, body };
      }
      const body = {
        success: true,
        pending: true,
        executionProvider: "binance",
        message: "لم يصل تأكيد نهائي من Binance. احتفظ النظام بالمبلغ محجوزًا لمنع تكرار البيع أو الشراء؛ افتح سجل الأوامر للتحديث.",
        order: localOrder?.toObject ? localOrder.toObject() : { _id: String(orderId), clientOrderId },
        matching: { matched: 0, trades: [] },
      };
      await saveFinalIdempotency(input, body, 202);
      return { status: 202, body };
    }
  }

  const settlement = await reconcileBinanceLiveOrder(String(orderId), exchangeOrder);
  const order = settlement.order;
  const matchingTrades = settlement.trades;
  const matchedQuantity = matchingTrades.reduce((sum: number, trade: any) => sum + Number(trade.quantity || 0), 0);
  const body = {
    success: true,
    executionProvider: "binance",
    message: matchedQuantity > 0
      ? "تم تأكيد التنفيذ من Binance. الكمية المنفذة مسجلة في سجل التداول."
      : order.status === "open"
        ? "تم قبول الأمر لدى Binance وهو مفتوح في دفتر أوامر السوق."
        : "أكدت Binance حالة الأمر؛ راجع سجل الأوامر لمعرفة الحالة النهائية.",
    order,
    matching: { matched: matchedQuantity, trades: matchingTrades },
  };
  const status = order.status === "rejected" ? 502 : 201;
  await saveFinalIdempotency(input, body, status);
  return { status, body };
}

async function saveFinalIdempotency(input: SubmitBinanceOrderInput, body: Record<string, any>, status: number) {
  if (!input.idempotencyKey) return;
  await IdempotencyKey.updateOne(
    { userId: input.userId, route: input.idempotencyRoute || "/api/orders", key: input.idempotencyKey },
    { $set: { responseStatus: status, responseBody: body } },
  );
}

async function rejectAndRelease(orderId: string, reason: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order: any = await Order.findById(orderId).session(session);
      if (!order || order.locksReleased) return;
      const reserveAsset = String(order.reservedAsset || (order.side === "buy" ? String(order.symbol).slice(-4) : String(order.symbol).slice(0, -4)));
      await changeWalletBalance(session, order.userId, reserveAsset, Number(order.reservedAmount || 0), -Number(order.reservedAmount || 0));
      order.status = "rejected";
      order.locksReleased = true;
      order.releasedAmount = Number(order.reservedAmount || 0);
      order.quantity = 0;
      order.lastExecutionError = reason.slice(0, 240);
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
}

export async function reconcileBinanceLiveOrder(orderId: string, supplied?: BinanceExecutionOrder) {
  const existing = await Order.findOne({ _id: orderId, executionProvider: "binance" }).lean() as any;
  if (!existing) throw new Error("BINANCE_LOCAL_ORDER_NOT_FOUND");
  if (!isBinanceLiveTradingConfigured()) throw new Error(binanceTradingUnavailableMessage());

  let external = supplied;
  if (!external) {
    external = await queryBinanceSpotOrder(String(existing.symbol), String(existing.clientOrderId));
  }

  const { getBinanceSpotPair } = await import("@/lib/binance-market");
  const pairResponse = await getBinanceSpotPair(String(existing.symbol));
  if (!pairResponse) throw new Error("BINANCE_PAIR_NOT_FOUND");
  const session = await mongoose.startSession();
  let outOrder: any = null;
  const fills: any[] = [];
  try {
    await session.withTransaction(async () => {
      const order: any = await Order.findById(orderId).session(session);
      if (!order || order.executionProvider !== "binance") throw new Error("BINANCE_LOCAL_ORDER_NOT_FOUND");
      if (order.locksReleased && isTerminal(String(order.status))) {
        outOrder = order.toObject();
        return;
      }

      const base = String(pairResponse.baseAsset).toUpperCase();
      const quote = String(pairResponse.quoteAsset).toUpperCase();
      const previousQty = Number(order.settledExecutedQuantity || 0);
      const previousQuote = Number(order.settledQuoteQuantity || 0);
      const previousFee = Number(order.settledFeeAmount || 0);
      const executedQty = Math.max(previousQty, Number(external?.executedQty || 0));
      const executedQuote = Math.max(previousQuote, Number(external?.cummulativeQuoteQty || 0));
      const deltaQty = round8(executedQty - previousQty);
      const deltaQuote = round8(executedQuote - previousQuote);
      const deltaFee = calculateTradingFee(deltaQuote, Number(order.feePercent || 0));
      const referenceId = "BINANCE:" + String(order._id) + ":" + executedQty.toFixed(8);
      const baseBefore = await totalWalletBalance(session, order.userId, base);
      const quoteBefore = await totalWalletBalance(session, order.userId, quote);

      if (deltaQuote > 0 || deltaFee > 0 || deltaQty > 0) {
        if (order.side === "buy") {
          await changeWalletBalance(session, order.userId, quote, 0, -(deltaQuote + deltaFee));
          if (deltaQty > 0) await changeWalletBalance(session, order.userId, base, deltaQty, 0);
          if (deltaQty > 0) await writeUserLedger(session, order.userId, base, deltaQty, baseBefore, round8(baseBefore + deltaQty), referenceId, "شراء Spot منفذ عبر Binance");
          if (deltaQuote > 0) await writeUserLedger(session, order.userId, quote, -deltaQuote, quoteBefore, round8(quoteBefore - deltaQuote), referenceId, "قيمة شراء Spot عبر Binance");
          if (deltaFee > 0) await writeUserLedger(session, order.userId, quote, -deltaFee, round8(quoteBefore - deltaQuote), round8(quoteBefore - deltaQuote - deltaFee), referenceId, "عمولة تداول Spot", "fee");
        } else {
          if (deltaQty > 0) await changeWalletBalance(session, order.userId, base, 0, -deltaQty);
          const credit = Math.max(0, round8(deltaQuote - deltaFee));
          if (credit > 0) await changeWalletBalance(session, order.userId, quote, credit, 0);
          if (deltaQty > 0) await writeUserLedger(session, order.userId, base, -deltaQty, baseBefore, round8(baseBefore - deltaQty), referenceId, "بيع Spot منفذ عبر Binance");
          if (deltaQuote > 0) await writeUserLedger(session, order.userId, quote, deltaQuote, quoteBefore, round8(quoteBefore + deltaQuote), referenceId, "حصيلة بيع Spot عبر Binance");
          if (deltaFee > 0) await writeUserLedger(session, order.userId, quote, -deltaFee, round8(quoteBefore + deltaQuote), round8(quoteBefore + deltaQuote - deltaFee), referenceId, "عمولة تداول Spot", "fee");
        }
        await writeSystemTradingFee(session, deltaFee, quote, referenceId);
      }

      if (deltaQty > 0 && deltaQuote > 0) {
        const price = round8(deltaQuote / deltaQty);
        const created = await Trade.create([{
          mode: "live",
          symbol: String(order.symbol),
          takerSide: order.side,
          side: order.side,
          executionProvider: "binance",
          userId: order.userId,
          orderId: order._id,
          price,
          quantity: deltaQty,
          quoteAmount: deltaQuote,
          feeBuyer: order.side === "buy" ? deltaFee : 0,
          feeSeller: order.side === "sell" ? deltaFee : 0,
          buyerFeeAsset: quote,
          sellerFeeAsset: quote,
        }], { session });
        fills.push({
          _id: String(created[0]._id),
          symbol: String(order.symbol),
          side: order.side,
          price,
          quantity: deltaQty,
          quoteAmount: deltaQuote,
          feeAmount: deltaFee,
          createdAt: created[0].createdAt,
        });
      }

      const exchangeStatus = String(external?.status || "NEW").toUpperCase();
      const terminal = isTerminal(exchangeStatus);
      const originalQuantity = Number(external?.origQty || order.originalQuantity || order.quantity || 0);
      const remaining = terminal ? 0 : round8(Math.max(0, originalQuantity - executedQty));
      const totalFee = round8(previousFee + deltaFee);
      const reserved = Number(order.reservedAmount || 0);
      const released = Number(order.releasedAmount || 0);
      const spent = order.side === "buy" ? executedQuote + totalFee : executedQty;
      const residualLocked = Math.max(0, round8(reserved - spent - released));
      const requiredRemaining = terminal ? 0 : order.side === "buy"
        ? round8(remaining * Number(order.price || 0) * (1 + Number(order.feePercent || 0) / 100))
        : remaining;
      const releaseNow = Math.max(0, round8(residualLocked - requiredRemaining));
      if (releaseNow > 0) {
        await changeWalletBalance(
          session,
          order.userId,
          order.side === "buy" ? quote : base,
          releaseNow,
          -releaseNow,
        );
      }

      order.externalOrderId = Number(external?.orderId || order.externalOrderId || 0) || undefined;
      order.originalQuantity = originalQuantity;
      order.filledQuantity = executedQty;
      order.quantity = remaining;
      if (order.type === "market" && executedQty > 0 && executedQuote > 0) {
        order.price = round8(executedQuote / executedQty);
      }
      order.settledExecutedQuantity = executedQty;
      order.settledQuoteQuantity = executedQuote;
      order.settledFeeAmount = totalFee;
      order.releasedAmount = round8(released + releaseNow);
      order.status = localStatus(exchangeStatus);
      order.locksReleased = terminal;
      order.updatedAt = new Date();
      await order.save({ session });
      outOrder = order.toObject();
    });
  } finally {
    await session.endSession();
  }

  return { order: outOrder, trades: fills };
}

export async function cancelBinanceLiveOrder(orderId: string, userId: mongoose.Types.ObjectId) {
  const order: any = await Order.findOne({ _id: orderId, userId, mode: "live", executionProvider: "binance" }).lean();
  if (!order) throw new Error("أمر Binance غير موجود");
  if (order.status !== "open") return { order, trades: [] };

  let result: BinanceExecutionOrder;
  try {
    result = await cancelBinanceSpotOrder(String(order.symbol), String(order.clientOrderId));
  } catch (error: any) {
    // The order may have filled just before the cancellation request reached Binance.
    result = await queryBinanceSpotOrder(String(order.symbol), String(order.clientOrderId));
    if (!isTerminal(String(result.status))) throw error;
  }
  return reconcileBinanceLiveOrder(orderId, result);
}
