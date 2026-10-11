
import crypto from "crypto";

const BASE_URL =
  process.env.BINANCE_API_BASE_URL ||
  "https://api.binance.com";

const API_KEY =
  process.env.BINANCE_API_KEY || "";

const API_SECRET =
  process.env.BINANCE_API_SECRET || "";

function requireCredentials() {
  if (!API_KEY || !API_SECRET) {
    throw new Error("BINANCE_API_CREDENTIALS_MISSING");
  }
}

function sign(payload: string) {
  return crypto
    .createHmac("sha256", API_SECRET)
    .update(payload)
    .digest("hex");
}

function buildSignedQuery(
  params: Record<string, string | number | boolean>
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }

  const query = search.toString();
  const signature = sign(query);

  return `${query}&signature=${signature}`;
}

async function getBinanceServerTime() {
  const response = await fetch(
    `${BASE_URL}/api/v3/time`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`BINANCE_TIME_${response.status}`);
  }

  const data = await response.json();
  return Number(data.serverTime);
}

async function binanceRequest(
  path: string,
  method: "GET" | "POST" | "DELETE",
  params: Record<string, string | number | boolean> = {},
  signed = false
) {
  if (signed) {
    requireCredentials();
  }

  let url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {};

  if (API_KEY) {
    headers["X-MBX-APIKEY"] = API_KEY;
  }

  if (signed) {
    const serverTime = await getBinanceServerTime();

    const signedQuery = buildSignedQuery({
      ...params,
      recvWindow: 5000,
      timestamp: serverTime,
    });

    url += `?${signedQuery}`;
  } else {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }

    const qs = query.toString();

    if (qs) {
      url += `?${qs}`;
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `BINANCE_${response.status}:${JSON.stringify(data)}`
    );
  }

  return data;
}

export async function getExchangeInfo(symbol?: string) {
  return binanceRequest(
    "/api/v3/exchangeInfo",
    "GET",
    symbol
      ? { symbol: symbol.toUpperCase() }
      : {}
  );
}

export async function getAccount() {
  return binanceRequest(
    "/api/v3/account",
    "GET",
    {},
    true
  );
}

export async function createSpotOrder(params: {
  symbol: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  quantity: number;
  price?: number;
  timeInForce?: "GTC" | "IOC" | "FOK";
  newClientOrderId?: string;
}) {
  const clean: Record<
    string,
    string | number
  > = {
    symbol: params.symbol.toUpperCase(),
    side: params.side,
    type: params.type,
    quantity: params.quantity,
  };

  if (params.price !== undefined) {
    clean.price = params.price;
  }

  if (params.timeInForce) {
    clean.timeInForce = params.timeInForce;
  }

  if (params.newClientOrderId) {
    clean.newClientOrderId =
      params.newClientOrderId;
  }

  return binanceRequest(
    "/api/v3/order",
    "POST",
    clean,
    true
  );
}

export async function cancelSpotOrder(params: {
  symbol: string;
  orderId?: number;
  origClientOrderId?: string;
}) {
  const clean: Record<
    string,
    string | number
  > = {
    symbol: params.symbol.toUpperCase(),
  };

  if (params.orderId !== undefined) {
    clean.orderId = params.orderId;
  }

  if (params.origClientOrderId) {
    clean.origClientOrderId =
      params.origClientOrderId;
  }

  return binanceRequest(
    "/api/v3/order",
    "DELETE",
    clean,
    true
  );
}

export async function getSpotOrder(params: {
  symbol: string;
  orderId?: number;
  origClientOrderId?: string;
}) {
  const clean: Record<
    string,
    string | number
  > = {
    symbol: params.symbol.toUpperCase(),
  };

  if (params.orderId !== undefined) {
    clean.orderId = params.orderId;
  }

  if (params.origClientOrderId) {
    clean.origClientOrderId =
      params.origClientOrderId;
  }

  return binanceRequest(
    "/api/v3/order",
    "GET",
    clean,
    true
  );
}
