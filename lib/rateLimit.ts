import { redis } from "@/lib/redis";

/*
 * Rate-limiter with dual backend:
 *
 *   Upstash Redis (production / serverless)
 *     Shared across all Vercel function instances so the limit is global.
 *     Uses INCR + EXPIRE inside a Redis pipeline (atomic, single HTTP call).
 *
 *   In-memory Map (local dev fallback)
 *     When UPSTASH_REDIS env vars are unset — same behavior as before.
 *     Logs a warning in production so the operator knows to configure Redis.
 *
 * Both backends expose the same `take(key, limit, windowMs)` async surface
 * so no structural changes are needed in route handlers beyond adding `await`.
 */

// ---------------------------------------------------------------------------
// In-memory backend (local dev fallback)
// ---------------------------------------------------------------------------

type Bucket = { count: number; resetAt: number };

const memBuckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;
let nextCleanupAt = Date.now();

function memTake(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (now >= nextCleanupAt) {
    for (const [bucketKey, bucket] of memBuckets) {
      if (now >= bucket.resetAt) memBuckets.delete(bucketKey);
    }
    nextCleanupAt = now + CLEANUP_INTERVAL_MS;
  }
  const b = memBuckets.get(key);
  if (!b || now >= b.resetAt) {
    if (memBuckets.size >= MAX_BUCKETS) {
      const oldestKey = memBuckets.keys().next().value;
      if (oldestKey !== undefined) memBuckets.delete(oldestKey);
    }
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Redis backend (Upstash HTTP REST API)
// ---------------------------------------------------------------------------

const REDIS_ENABLED = redis !== null;

/**
 * Sliding-window rate limit check via Upstash Redis HTTP API.
 *
 * Uses a Redis pipeline to atomically:
 *   1. INCR a key scoped to the current window (`ratelimit:{key}`)
 *   2. EXPIRE the key to auto-evict after the window
 *
 * If INCR returns 1 (first request in window), the EXPIRE sets the TTL.
 * If INCR returns > 1, EXPIRE refreshes the TTL so slow trickle requests
 * don't let the key persist indefinitely after the window ends.
 *
 * On transient Redis errors the check is *denied* (returns false) so a
 * Redis outage doesn't silently disable rate limiting. The caller can then
 * surface a user-friendly 429 or 503.
 */
async function redisTake(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;
  const ttlSeconds = Math.ceil(windowMs / 1000);
  try {
    // Pipeline sends INCR and EXPIRE in a single HTTP request.
    // redisTake is only called when REDIS_ENABLED is true (redis !== null),
    // so the non-null assertion is safe here.
    const [incrResult] = await redis!
      .pipeline()
      .incr(redisKey)
      .expire(redisKey, ttlSeconds)
      .exec<[number, number]>();

    const allowed = incrResult <= limit;
    if (!allowed) {
      console.warn(
        "[WARN] [rateLimit] Redis rate limit hit key=%s count=%s limit=%s",
        key,
        incrResult,
        limit
      );
    }
    return allowed;
  } catch (err) {
    console.error(
      "[ERROR] [rateLimit] Redis take failed key=%s error=%o",
      key,
      err
    );
    // Deny on Redis errors so an outage doesn't disable rate limiting.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check and consume a rate-limit token for `key`.
 *
 * Returns `true` if the request is within limit, `false` if the limit has been
 * exceeded for this window.
 *
 * Backend is auto-selected based on whether Upstash Redis env vars are set.
 */
export async function take(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  if (REDIS_ENABLED) {
    return redisTake(key, limit, windowMs);
  }
  // In-memory fallback — the redis.ts module already warns once on startup
  // when Redis is unconfigured in production, so we don't repeat it here.
  return memTake(key, limit, windowMs);
}
