import { createHmac } from "node:crypto";
import { fetchBinanceJson } from "@/lib/binance-market";

export type BinanceOrderSide = "BUY" | "SELL";
export type BinanceOrderType = "MARKET" | "LIMIT";

export type BinanceExecutionOrder = {
  symbol: string;
  orderId?: number;
  clientOrderId?: string;
  origClientOrderId?: string;
  status: string;
  type?: string;
  side?: string;
  price?: string;
  origQty?: string;
  executedQty?: string;
  cummulativeQuoteQty?: string;
  transactTime?: number;
  updateTime?: number;
  fills?: Array<{
    price: string;
    qty: string;
    commission?: string;
    commissionAsset?: string;
    tradeId?: number;
  }>;
};

export type BinanceDepth = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

export type BinancePublicTrade = {
  id: number;
  price: string;
  qty: string;
  quoteQty?: string;
  time: number;
  isBuyerMaker: boolean;
};

export class BinanceTradingError extends Error {
  status: number;
  code?: number;
  constructor(message: string, status = 502, code?: number) {
    super(message);
    this.name = "BinanceTradingError";
    this.status = status;
    this.code = code;
  }
}

export function isBinanceLiveTradingConfigured() {
  return process.env.BINANCE_LIVE_TRADING_ENABLED === "true" &&
    Boolean(process.env.BINANCE_API_KEY?.trim()) &&
    Boolean(process.env.BINANCE_API_SECRET?.trim());
}

export function binanceTradingUnavailableMessage() {
  if (process.env.BINANCE_LIVE_TRADING_ENABLED !== "true") {
    return "التنفيذ الحقيقي غير مفعّل بعد. يجب ضبط BINANCE_LIVE_TRADING_ENABLED=true بعد إعداد حساب Binance.";
  }
  return "مفاتيح Binance API غير مكتملة. أضف BINANCE_API_KEY وBINANCE_API_SECRET كمتغيرات سرية في الاستضافة، ولا تضعها داخل الكود.";
}

function tradingBaseUrl() {
  if (process.env.BINANCE_TRADE_TESTNET === "true") {
    return "https://testnet.binance.vision";
  }
  return String(process.env.BINANCE_TRADE_API_BASE || "https://api.binance.com")
    .trim()
    .replace(/\/+$/, "");
}

async function signedRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  values: Record<string, string | number | undefined | null>,
): Promise<T> {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const secret = process.env.BINANCE_API_SECRET?.trim();
  if (!apiKey || !secret || process.env.BINANCE_LIVE_TRADING_ENABLED !== "true") {
    throw new BinanceTradingError(binanceTradingUnavailableMessage(), 503);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      params.set(key, String(value));
    }
  }
  params.set("timestamp", String(Date.now()));
  params.set("recvWindow", "5000");
  const payload = params.toString();
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const url = tradingBaseUrl() + path + "?" + payload + "&signature=" + signature;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "X-MBX-APIKEY": apiKey, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
  } catch {
    throw new BinanceTradingError("تعذر الاتصال بواجهة تنفيذ Binance. لم يتم تأكيد حالة الأمر؛ يجب التحقق من سجل الأوامر قبل إعادة المحاولة.", 503);
  }

  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    const message = String(data?.msg || "تعذر تنفيذ الطلب لدى Binance");
    const code = Number.isFinite(Number(data?.code)) ? Number(data.code) : undefined;
    throw new BinanceTradingError(message, response.status, code);
  }
  return data as T;
}

export async function getBinancePublicPrice(symbol: string): Promise<number> {
  const normalized = String(symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{5,25}$/.test(normalized)) throw new BinanceTradingError("زوج التداول غير صالح", 400);
  const data = await fetchBinanceJson<{ symbol?: string; price?: string }>(
    "ticker/price?symbol=" + encodeURIComponent(normalized),
    2,
  );
  const price = Number(data?.price);
  if (!Number.isFinite(price) || price <= 0) throw new BinanceTradingError("سعر السوق غير متاح لهذا الزوج", 502);
  return price;
}

export async function getBinanceOrderBook(symbol: string, depth = 20) {
  const normalized = String(symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{5,25}$/.test(normalized)) throw new BinanceTradingError("زوج التداول غير صالح", 400);
  const limit = Math.min(100, Math.max(5, Math.floor(depth || 20)));
  return fetchBinanceJson<BinanceDepth>(
    "depth?symbol=" + encodeURIComponent(normalized) + "&limit=" + limit,
    1,
  );
}

export async function getBinanceRecentTrades(symbol: string, limit = 50) {
  const normalized = String(symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{5,25}$/.test(normalized)) throw new BinanceTradingError("زوج التداول غير صالح", 400);
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit || 50)));
  return fetchBinanceJson<BinancePublicTrade[]>(
    "trades?symbol=" + encodeURIComponent(normalized) + "&limit=" + safeLimit,
    1,
  );
}

export async function placeBinanceSpotOrder(input: {
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  quantity?: number;
  quoteOrderQty?: number;
  price?: number;
  clientOrderId: string;
}): Promise<BinanceExecutionOrder> {
  const symbol = input.symbol.toUpperCase();
  const side: BinanceOrderSide = input.side === "buy" ? "BUY" : "SELL";
  const type: BinanceOrderType = input.type === "limit" ? "LIMIT" : "MARKET";
  if (type === "LIMIT" && (!Number.isFinite(input.price) || Number(input.price) <= 0)) {
    throw new BinanceTradingError("سعر الأمر المحدد غير صالح", 400);
  }
  if (type === "LIMIT" || side === "SELL" || input.quoteOrderQty == null) {
    if (!Number.isFinite(input.quantity) || Number(input.quantity) <= 0) {
      throw new BinanceTradingError("كمية الأمر غير صالحة", 400);
    }
  }
  const resultType = type === "MARKET" ? "FULL" : "RESULT";
  return signedRequest<BinanceExecutionOrder>("POST", "/api/v3/order", {
    symbol,
    side,
    type,
    ...(type === "LIMIT" ? { timeInForce: "GTC", price: String(input.price) } : {}),
    ...(type === "MARKET" && side === "BUY" && input.quoteOrderQty != null
      ? { quoteOrderQty: Number(input.quoteOrderQty).toFixed(8) }
      : { quantity: Number(input.quantity).toFixed(8) }),
    newClientOrderId: input.clientOrderId,
    newOrderRespType: resultType,
  });
}

export async function queryBinanceSpotOrder(symbol: string, clientOrderId: string) {
  return signedRequest<BinanceExecutionOrder>("GET", "/api/v3/order", {
    symbol: symbol.toUpperCase(),
    origClientOrderId: clientOrderId,
  });
}

export async function cancelBinanceSpotOrder(symbol: string, clientOrderId: string) {
  return signedRequest<BinanceExecutionOrder>("DELETE", "/api/v3/order", {
    symbol: symbol.toUpperCase(),
    origClientOrderId: clientOrderId,
    newClientOrderId: "ATC" + Date.now().toString(36),
  });
}
