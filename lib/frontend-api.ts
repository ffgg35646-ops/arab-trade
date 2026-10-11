export type ApiResult<T = any> = {
  success: boolean;
  message?: string;
  [key: string]: any;
};

export async function apiFetch<T = ApiResult>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();

  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`استجابة غير صالحة من ${url}`);
  }

  if (!response.ok) {
    throw new Error(
      String(data?.message || `تعذر تنفيذ الطلب (${response.status})`)
    );
  }

  return data as T;
}

export const api = {
  me: () => apiFetch("/api/auth/me"),

  wallet: () => apiFetch("/api/wallet"),

  assets: () => apiFetch("/api/assets"),

  orders: (params = "") =>
    apiFetch(`/api/orders${params ? `?${params}` : ""}`),

  trades: (params = "") =>
    apiFetch(`/api/trades${params ? `?${params}` : ""}`),

  orderBook: (symbol: string, limit = 50) =>
    apiFetch(`/api/orderbook?symbol=${encodeURIComponent(symbol)}&limit=${limit}`),

  notifications: () =>
    apiFetch("/api/notifications"),

  notificationPreferences: () =>
    apiFetch("/api/notifications/preferences"),

  referral: () =>
    apiFetch("/api/referral"),

  referralCommissions: () =>
    apiFetch("/api/referral/commissions"),

  rewards: () =>
    apiFetch("/api/rewards"),

  ledger: (params = "") =>
    apiFetch(`/api/account/ledger${params ? `?${params}` : ""}`),

  statement: (params = "") =>
    apiFetch(`/api/account/statement${params ? `?${params}` : ""}`),

  reports: (params = "") =>
    apiFetch(`/api/account/reports${params ? `?${params}` : ""}`),

  sessions: () =>
    apiFetch("/api/account/sessions"),

  twoFactor: () =>
    apiFetch("/api/account/2fa"),

  marginPositions: () =>
    apiFetch("/api/margin/positions"),

  futuresPositions: () =>
    apiFetch("/api/futures/positions"),
};