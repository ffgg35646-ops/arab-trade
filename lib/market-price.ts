const BINANCE_API = "https://api.binance.com";

export async function getMarketLastPrice(
  symbol: string
): Promise<number> {
  const normalized = String(symbol || "").toUpperCase();

  if (!/^[A-Z0-9]{5,20}$/.test(normalized)) {
    throw new Error("INVALID_SYMBOL");
  }

  const response = await fetch(
    `${BINANCE_API}/api/v3/ticker/price?symbol=${normalized}`,
    {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("MARKET_DATA_UNAVAILABLE");
  }

  const data = await response.json();

  const price = Number(data?.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("INVALID_MARKET_PRICE");
  }

  return price;
}
