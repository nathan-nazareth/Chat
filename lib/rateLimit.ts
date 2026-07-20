type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function take(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export function reset(key: string) {
  buckets.delete(key);
}
