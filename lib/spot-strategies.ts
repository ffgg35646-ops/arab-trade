import mongoose from "mongoose";
import { getBinanceSpotPair } from "@/lib/binance-market";
import { getBinancePublicPrice, isBinanceLiveTradingConfigured } from "@/lib/binance-trading";
import { getPlatformSettings } from "@/lib/platform-settings";
import { submitBinanceLiveOrder, reconcileBinanceLiveOrder } from "@/lib/binance-live-orders";
import { hashRequest } from "@/lib/idempotency";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";
import { consolidateFundingWalletIntoSpotWallet } from "@/lib/consolidate-funding-wallet";
import Asset from "@/models/Asset";
import Order from "@/models/Order";
import SpotStrategy from "@/models/SpotStrategy";

const round8 = (value: number) => Number(value.toFixed(8));
const terminalOrderStatuses = new Set(["filled", "cancelled", "rejected"]);

function addEvent(
  strategy: any,
  kind: "info" | "signal" | "order" | "error",
  message: string,
  price?: number,
  orderId?: string,
) {
  strategy.events = Array.isArray(strategy.events) ? strategy.events : [];
  strategy.events.push({
    kind,
    message: String(message).slice(0, 300),
    ...(Number.isFinite(price) && Number(price) > 0 ? { price: Number(price) } : {}),
    ...(orderId ? { orderId: String(orderId) } : {}),
    createdAt: new Date(),
  });
  if (strategy.events.length > 50) {
    strategy.events = strategy.events.slice(-50);
  }
}

function entryTriggered(strategy: any, price: number) {
  return strategy.entryOperator === "at_or_above"
    ? price >= Number(strategy.entryPrice)
    : price <= Number(strategy.entryPrice);
}

function exitTriggered(strategy: any, price: number) {
  const takeProfit = Number(strategy.takeProfitPrice || 0);
  const stopLoss = Number(strategy.stopLossPrice || 0);
  if (takeProfit > 0 && price >= takeProfit) {
    return { triggered: true, reason: "take_profit" as const };
  }
  if (stopLoss > 0 && price <= stopLoss) {
    return { triggered: true, reason: "stop_loss" as const };
  }
  return { triggered: false, reason: null };
}

async function assertLiveSpotAvailable(strategy: any) {
  if (!isBinanceLiveTradingConfigured()) {
    throw new Error("التداول الحقيقي عبر Binance غير مفعّل أو مفاتيح API غير مكتملة.");
  }

  const settings = await getPlatformSettings();
  if (!settings.trading.enabled || !settings.trading.spotEnabled) {
    throw new Error("التداول الفوري متوقف في إعدادات المنصة.");
  }

  const pair = await getBinanceSpotPair(String(strategy.symbol));
  if (!pair) throw new Error("زوج التداول لم يعد متاحًا ضمن Binance Spot.");

  const assetRows = await Asset.find({
    symbol: { $in: [pair.baseAsset, pair.quoteAsset] },
  }).select("symbol enabled tradingEnabled").lean();

  for (const symbol of [pair.baseAsset, pair.quoteAsset]) {
    const asset: any = assetRows.find((row: any) => String(row.symbol).toUpperCase() === symbol);
    if (!asset || asset.enabled !== true || asset.tradingEnabled !== true) {
      throw new Error("إحدى عملتي الزوج غير مفعّلة للتداول بواسطة إدارة عرب تريد.");
    }
  }

  return { settings, pair };
}

async function submitStrategyOrder(strategy: any, side: "buy" | "sell", price: number) {
  const { settings, pair } = await assertLiveSpotAvailable(strategy);
  await migrateLegacyDepositBalancesToSpotWallet(strategy.userId);
  await consolidateFundingWalletIntoSpotWallet(strategy.userId);

  const feePercent = Number(settings.trading.defaultFeePercent || 0);
  const quantity = side === "buy"
    ? round8(Number(strategy.quoteBudget) / price / (1 + Math.max(0, feePercent) / 100))
    : round8(Number(strategy.positionQuantity || 0));

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(side === "buy" ? "ميزانية الشراء لا تكفي لإرسال أمر صحيح." : "لا توجد كمية عملة متاحة للبيع في الاستراتيجية.");
  }

  const cycleKey = String(strategy.cyclesCompleted || 0);
  const idempotencyKey = "spot-strategy-" + String(strategy._id) + "-" + cycleKey + "-" + side;
  const requestBody = {
    strategyId: String(strategy._id),
    cycle: Number(strategy.cyclesCompleted || 0),
    symbol: strategy.symbol,
    side,
    type: "market",
    quantity,
  };

  const result = await submitBinanceLiveOrder({
    userId: strategy.userId,
    symbol: String(strategy.symbol),
    side,
    type: "market",
    price,
    quantity,
    baseAsset: String(pair.baseAsset),
    quoteAsset: String(pair.quoteAsset),
    pair,
    feePercent,
    minOrderAmount: Number(settings.trading.minOrderAmount || 10),
    maxOrderAmount: Number(settings.trading.maxOrderAmount || 100000),
    purpose: "spot",
    idempotencyKey,
    requestHash: hashRequest(requestBody),
    idempotencyRoute: "/api/trading-strategies/" + String(strategy._id) + "/" + side,
  });

  const body: any = result.body;
  if (result.status >= 400 || body.success === false) {
    throw new Error(String(body.message || "رفضت Binance أمر الاستراتيجية."));
  }

  const orderId = String(body.order?._id || body.orderId || "");
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("لم يرجع تنفيذ Binance معرف أمر صالحًا؛ راجع سجل الأوامر قبل إعادة المحاولة.");
  }

  strategy.pendingOrderId = new mongoose.Types.ObjectId(orderId);
  strategy.pendingSide = side;
  strategy.phase = side === "buy" ? "buy_pending" : "sell_pending";
  strategy.lastSignal = side === "buy" ? "تم إرسال أمر شراء إلى Binance" : "تم إرسال أمر بيع إلى Binance";
  strategy.lastError = "";
  addEvent(strategy, "order", side === "buy" ? "أُرسل أمر شراء سوق إلى Binance، بانتظار تأكيد الكمية المنفذة." : "أُرسل أمر بيع سوق إلى Binance، بانتظار تأكيد الكمية المنفذة.", price, orderId);
  await strategy.save();

  return { orderId, status: result.status, pending: Boolean(body.pending) };
}

async function reconcilePendingOrder(strategy: any) {
  const pendingId = String(strategy.pendingOrderId || "");
  const pendingSide = strategy.pendingSide as "buy" | "sell" | null;
  if (!pendingId || !pendingSide) return false;

  const result = await reconcileBinanceLiveOrder(pendingId);
  const order: any = result.order;
  if (!order) return false;

  const status = String(order.status || "open").toLowerCase();
  if (!terminalOrderStatuses.has(status)) {
    strategy.lastPrice = Number(strategy.lastPrice || 0);
    return false;
  }

  const filled = Math.max(0, Number(order.filledQuantity ?? order.settledExecutedQuantity ?? 0));
  const avgPrice = Number(order.price || order.settledQuoteQuantity / Math.max(filled, 1e-12) || 0);

  strategy.pendingOrderId = null;
  strategy.pendingSide = null;

  if (pendingSide === "buy") {
    if (filled > 0) {
      strategy.positionQuantity = round8(filled);
      strategy.averageEntryPrice = avgPrice > 0 ? avgPrice : Number(strategy.lastPrice || 0);
      strategy.phase = "holding";
      strategy.lastSignal = "تم تأكيد شراء " + String(strategy.positionQuantity) + " " + strategy.baseAsset;
      strategy.lastError = "";
      addEvent(strategy, "order", "تم تأكيد شراء فعلي من Binance؛ الكمية المسجلة هي المنفذة فقط.", strategy.averageEntryPrice, pendingId);
    } else {
      strategy.phase = "waiting_to_buy";
      strategy.status = "paused";
      strategy.lastError = "انتهى أمر الشراء دون تنفيذ كمية. أوقفنا الاستراتيجية لتجنب تكرار المحاولة تلقائيًا.";
      addEvent(strategy, "error", strategy.lastError, Number(strategy.lastPrice || 0), pendingId);
    }
  } else {
    const remaining = Math.max(0, round8(Number(strategy.positionQuantity || 0) - filled));
    strategy.positionQuantity = remaining;
    if (remaining > 1e-8) {
      strategy.phase = "holding";
      strategy.lastSignal = "تم بيع جزء من الكمية؛ ما زال هناك رصيد للعملة في الاستراتيجية";
      addEvent(strategy, "info", "انتهى أمر البيع مع بقاء كمية غير مباعة؛ راجع الرصيد وسجل الأوامر.", Number(strategy.lastPrice || 0), pendingId);
    } else {
      strategy.positionQuantity = 0;
      strategy.averageEntryPrice = undefined;
      strategy.cyclesCompleted = Number(strategy.cyclesCompleted || 0) + 1;
      addEvent(strategy, "order", "تم تأكيد البيع من Binance وإغلاق دورة الاستراتيجية.", Number(strategy.lastPrice || 0), pendingId);
      if (strategy.cyclesCompleted >= Number(strategy.maxCycles || 1)) {
        strategy.status = "completed";
        strategy.phase = "waiting_to_buy";
        strategy.stoppedAt = new Date();
        strategy.lastSignal = "اكتملت جميع دورات الاستراتيجية";
      } else {
        strategy.phase = "waiting_to_buy";
        strategy.lastSignal = "اكتملت دورة البيع؛ تنتظر الاستراتيجية إشارة شراء جديدة";
      }
    }
    strategy.lastError = "";
  }

  await strategy.save();
  return true;
}

async function processStrategy(strategyId: string) {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + 55_000);
  const strategy: any = await SpotStrategy.findOneAndUpdate(
    {
      _id: strategyId,
      $and: [
        {
          $or: [
            { runLockUntil: null },
            { runLockUntil: { $exists: false } },
            { runLockUntil: { $lte: now } },
          ],
        },
        {
          $or: [
            { status: "running" },
            { pendingOrderId: { $ne: null } },
          ],
        },
      ],
    },
    { $set: { runLockUntil: lockUntil } },
    { new: true },
  );

  if (!strategy) return { skipped: true, reason: "LOCKED_OR_INACTIVE" };

  try {
    if (strategy.pendingOrderId && strategy.pendingSide) {
      try {
        await reconcilePendingOrder(strategy);
      } catch (error) {
        strategy.lastError = error instanceof Error ? error.message.slice(0, 300) : "تعذر تحديث حالة أمر Binance";
        await strategy.save();
      }
      return { strategyId, processed: true, phase: strategy.phase, pending: true };
    }

    if (strategy.status !== "running") {
      return { strategyId, processed: true, phase: strategy.phase, paused: true };
    }

    const price = await getBinancePublicPrice(String(strategy.symbol));
    strategy.lastPrice = price;
    strategy.lastCheckedAt = new Date();
    strategy.lastError = "";

    if (strategy.phase === "waiting_to_buy" && entryTriggered(strategy, price)) {
      const signal = strategy.entryOperator === "at_or_above" ? "وصل السعر إلى حد الشراء الصاعد" : "هبط السعر إلى حد الشراء المحدد";
      strategy.lastSignal = signal;
      if (strategy.executionMode === "bot") {
        await strategy.save();
        await submitStrategyOrder(strategy, "buy", price);
        return { strategyId, processed: true, action: "buy" };
      }
      strategy.phase = "buy_signal";
      addEvent(strategy, "signal", signal + "؛ يلزم تأكيدك اليدوي قبل إرسال الشراء.", price);
    } else if (strategy.phase === "holding") {
      const exit = exitTriggered(strategy, price);
      if (exit.triggered) {
        const signal = exit.reason === "take_profit" ? "وصل السعر إلى هدف جني الربح" : "وصل السعر إلى وقف الخسارة";
        strategy.lastSignal = signal;
        if (strategy.executionMode === "bot") {
          await strategy.save();
          await submitStrategyOrder(strategy, "sell", price);
          return { strategyId, processed: true, action: "sell" };
        }
        strategy.phase = "sell_signal";
        addEvent(strategy, "signal", signal + "؛ يلزم تأكيدك اليدوي قبل إرسال البيع.", price);
      }
    }

    await strategy.save();
    return { strategyId, processed: true, phase: strategy.phase, price };
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تشغيل استراتيجية التداول";
    strategy.lastError = message.slice(0, 300);
    addEvent(strategy, "error", strategy.lastError, Number(strategy.lastPrice || 0));
    if (!strategy.pendingOrderId) {
      strategy.status = "paused";
      strategy.stoppedAt = new Date();
    }
    await strategy.save();
    return { strategyId, processed: false, error: strategy.lastError };
  } finally {
    await SpotStrategy.updateOne(
      { _id: strategyId },
      { $set: { runLockUntil: null } },
    );
  }
}

export async function createSpotStrategy(input: {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  executionMode: "manual" | "bot";
  entryOperator: "at_or_below" | "at_or_above";
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice?: number;
  quoteBudget: number;
  maxCycles: number;
}) {
  if (!isBinanceLiveTradingConfigured()) {
    throw new Error("لا يمكن إنشاء استراتيجية حقيقية قبل إعداد مفاتيح Binance وتفعيل التنفيذ الحقيقي.");
  }

  const settings = await getPlatformSettings();
  if (!settings.trading.enabled || !settings.trading.spotEnabled) {
    throw new Error("التداول الفوري متوقف في إعدادات المنصة.");
  }

  const symbol = String(input.symbol || "").trim().toUpperCase().replace(/[_/\s-]/g, "");
  const pair = await getBinanceSpotPair(symbol);
  if (!pair) throw new Error("زوج التداول غير نشط أو غير متاح على Binance Spot.");

  const assets = await Asset.find({
    symbol: { $in: [pair.baseAsset, pair.quoteAsset] },
    enabled: true,
    tradingEnabled: true,
  }).select("symbol").lean();
  if (assets.length !== 2) {
    throw new Error("يجب تفعيل عملتي الزوج للتداول من لوحة الإدارة أولًا.");
  }

  const entryPrice = Number(input.entryPrice);
  const takeProfitPrice = Number(input.takeProfitPrice);
  const stopLossPrice = input.stopLossPrice === undefined ? undefined : Number(input.stopLossPrice);
  const quoteBudget = Number(input.quoteBudget);
  const maxCycles = Number(input.maxCycles);

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error("سعر الدخول غير صالح.");
  if (!Number.isFinite(takeProfitPrice) || takeProfitPrice <= entryPrice) {
    throw new Error("هدف جني الربح يجب أن يكون أعلى من سعر الدخول.");
  }
  if (stopLossPrice !== undefined && (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0 || stopLossPrice >= entryPrice)) {
    throw new Error("وقف الخسارة يجب أن يكون أقل من سعر الدخول.");
  }
  if (!Number.isFinite(quoteBudget) ||
      quoteBudget < Number(settings.trading.minOrderAmount || 10) ||
      quoteBudget > Number(settings.trading.maxOrderAmount || 100000)) {
    throw new Error("ميزانية الصفقة يجب أن تكون بين " +
      Number(settings.trading.minOrderAmount || 10) + " و" +
      Number(settings.trading.maxOrderAmount || 100000) + " " + pair.quoteAsset + ".");
  }
  if (!Number.isInteger(maxCycles) || maxCycles < 1 || maxCycles > 100) {
    throw new Error("عدد دورات التداول يجب أن يكون من 1 إلى 100.");
  }
  if (input.executionMode !== "manual" && input.executionMode !== "bot") {
    throw new Error("اختر التشغيل اليدوي أو البوت الآلي.");
  }
  if (input.entryOperator !== "at_or_below" && input.entryOperator !== "at_or_above") {
    throw new Error("شرط الدخول غير صالح.");
  }

  return SpotStrategy.create({
    userId: input.userId,
    symbol,
    baseAsset: pair.baseAsset,
    quoteAsset: pair.quoteAsset,
    executionMode: input.executionMode,
    entryOperator: input.entryOperator,
    entryPrice,
    takeProfitPrice,
    ...(stopLossPrice ? { stopLossPrice } : {}),
    quoteBudget,
    maxCycles,
    status: "paused",
    phase: "waiting_to_buy",
    events: [{
      kind: "info",
      message: input.executionMode === "bot"
        ? "تم إنشاء بوت بسعر دخول وهدف بيع محددين. البوت متوقف حتى تضغط تشغيل."
        : "تم إنشاء استراتيجية مراقبة يدوية. عند تحقق الشرط ستظهر إشارة وتحتاج إلى تأكيدك.",
      createdAt: new Date(),
    }],
  });
}

export async function executeManualStrategyAction(
  strategy: any,
  action: "execute-buy" | "execute-sell",
) {
  if (strategy.status !== "running") throw new Error("شغّل الاستراتيجية قبل تأكيد تنفيذ الإشارة.");
  const buy = action === "execute-buy";
  if (buy && (strategy.executionMode !== "manual" || strategy.phase !== "buy_signal")) {
    throw new Error("لا توجد إشارة شراء يدوية جاهزة للتنفيذ.");
  }
  if (!buy && (strategy.executionMode !== "manual" || strategy.phase !== "sell_signal" || Number(strategy.positionQuantity || 0) <= 0)) {
    throw new Error("لا توجد إشارة بيع يدوية أو كمية متاحة للبيع.");
  }
  const price = await getBinancePublicPrice(String(strategy.symbol));
  strategy.lastPrice = price;
  await submitStrategyOrder(strategy, buy ? "buy" : "sell", price);
  return strategy;
}

export async function startSpotStrategy(strategy: any) {
  if (!strategy) throw new Error("الاستراتيجية غير موجودة.");
  if (strategy.status === "completed") throw new Error("اكتملت الاستراتيجية بالفعل؛ أنشئ استراتيجية جديدة لتحديد قواعد جديدة.");
  if (!isBinanceLiveTradingConfigured()) throw new Error("التداول الحقيقي عبر Binance غير مفعّل.");
  strategy.status = "running";
  strategy.startedAt = new Date();
  strategy.stoppedAt = null;
  strategy.lastError = "";
  addEvent(strategy, "info", strategy.executionMode === "bot"
    ? "تم تشغيل البوت الآلي. سيراقب السعر ويرسل أوامر سوق حقيقية عند تحقق الشروط."
    : "بدأت مراقبة السعر. لن يُرسل أي أمر حقيقي إلا بعد تأكيدك يدويًا للإشارة.");
  await strategy.save();
  return strategy;
}

export async function pauseSpotStrategy(strategy: any) {
  strategy.status = "paused";
  strategy.stoppedAt = new Date();
  addEvent(strategy, "info", strategy.pendingOrderId
    ? "تم إيقاف الاستراتيجية مؤقتًا. سيظل النظام يحدّث الأمر المعلّق للتأكد من حالة Binance، ولن يبدأ إشارات جديدة."
    : "تم إيقاف الاستراتيجية مؤقتًا. لن تبدأ صفقات جديدة.");
  await strategy.save();
  return strategy;
}

export async function runAllSpotStrategies() {
  const now = new Date();
  const eligible = await SpotStrategy.find({
    $or: [
      { status: "running" },
      { pendingOrderId: { $ne: null } },
    ],
    $and: [
      {
        $or: [
          { runLockUntil: null },
          { runLockUntil: { $exists: false } },
          { runLockUntil: { $lte: now } },
        ],
      },
    ],
  })
    .select("_id")
    .sort({ updatedAt: 1 })
    .limit(50)
    .lean();

  const results = [];
  for (const item of eligible) {
    results.push(await processStrategy(String(item._id)));
  }

  return {
    found: eligible.length,
    processed: results.filter((item: any) => item.processed).length,
    failed: results.filter((item: any) => item.error).length,
    results,
    executedAt: new Date().toISOString(),
  };
}
