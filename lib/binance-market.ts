const DEFAULT_BINANCE_MARKET_APIS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
];

export type BinanceMarketFilter = {
  filterType: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minNotional?: string;
  notional?: string;
};

export type BinanceSpotSymbol = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
  permissions?: string[];
  permissionSets?: string[][];
  filters?: BinanceMarketFilter[];
  baseAssetPrecision?: number;
  quotePrecision?: number;
};

function apiBases() {
  const configured = String(process.env.BINANCE_SPOT_API_BASE || "")
    .trim()
    .replace(/\/+$/, "");
  return [...(configured ? [configured] : []), ...DEFAULT_BINANCE_MARKET_APIS]
    .filter((value, index, all) => all.indexOf(value) === index);
}

export async function fetchBinanceJson<T>(
  endpoint: string,
  revalidateSeconds = 15
): Promise<T> {
  const path = endpoint.replace(/^\/+/, "");
  let lastError: unknown = null;

  for (const base of apiBases()) {
    try {
      const response = await fetch(base + "/api/v3/" + path, {
        headers: { accept: "application/json" },
        next: { revalidate: revalidateSeconds },
      });
      if (!response.ok) {
        lastError = new Error("Binance market API returned " + response.status);
        continue;
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("BINANCE_MARKET_UNAVAILABLE");
}

export function isActiveBinanceSpotPair(pair: BinanceSpotSymbol) {
  if (pair.status !== "TRADING") return false;
  if (pair.isSpotTradingAllowed === false) return false;
  if (pair.isSpotTradingAllowed === true) return true;

  const permissions = Array.isArray(pair.permissions) ? pair.permissions : [];
  const permissionSets = Array.isArray(pair.permissionSets) ? pair.permissionSets : [];
  const hasPermissionMetadata = permissions.length > 0 || permissionSets.length > 0;
  if (!hasPermissionMetadata) return true;

  return permissions.includes("SPOT") ||
    permissionSets.some((set) => Array.isArray(set) && set.includes("SPOT"));
}

export async function getBinanceSpotPair(symbol: string) {
  const normalized = String(symbol || "").toUpperCase().replace(/[_/\s-]/g, "");
  if (!/^[A-Z0-9]{5,25}$/.test(normalized)) return null;

  const info = await fetchBinanceJson<{ symbols?: BinanceSpotSymbol[] }>(
    "exchangeInfo?symbol=" + encodeURIComponent(normalized),
    60
  );
  return (info.symbols || []).find(
    (item) => item.symbol === normalized && isActiveBinanceSpotPair(item)
  ) || null;
}
