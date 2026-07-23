import { Redis } from "@upstash/redis";

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const hasCredentials =
  typeof UPSTASH_REDIS_REST_URL === "string" &&
  UPSTASH_REDIS_REST_URL.length > 0 &&
  typeof UPSTASH_REDIS_REST_TOKEN === "string" &&
  UPSTASH_REDIS_REST_TOKEN.length > 0;

export const redis: Redis | null = hasCredentials
  ? new Redis({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

if (!redis && process.env.NODE_ENV === "production") {
  console.warn(
    "[WARN] [redis] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set. " +
      "Rate limiting will fall back to in-memory (per-instance) storage, " +
      "which is ineffective across multiple serverless instances."
  );
}

