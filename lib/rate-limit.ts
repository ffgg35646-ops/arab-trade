
type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
) {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const entry = {
      count: 1,
      resetAt: now + windowMs
    };

    store.set(key, entry);

    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAt: entry.resetAt
    };
  }

  existing.count += 1;

  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt
  };
}