import { getRedisClient } from "@/lib/upstash";

const IP_RATE_LIMIT = 20;
const IP_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const KEY_PREFIX = "ip_rate_limit";

type MemoryRateLimitRecord = {
  count: number;
  resetAt: number;
};

export type IpRateLimitResult = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetInSeconds: number;
  identifier: string;
  storage: "upstash" | "memory";
};

declare global {
  var __ipRateLimitStore__: Map<string, MemoryRateLimitRecord> | undefined;
}

const inMemoryIpRateLimitStore =
  globalThis.__ipRateLimitStore__ ?? new Map<string, MemoryRateLimitRecord>();

globalThis.__ipRateLimitStore__ = inMemoryIpRateLimitStore;

function getRateLimitKey(identifier: string) {
  return `${KEY_PREFIX}:${identifier}`;
}

function getRemaining(limit: number, used: number) {
  return Math.max(0, limit - used);
}

function getResetInSecondsFromResetAt(resetAt: number) {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}

function consumeInMemoryIpRateLimit(identifier: string): IpRateLimitResult {
  const now = Date.now();
  const existing = inMemoryIpRateLimitStore.get(identifier);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + IP_RATE_LIMIT_WINDOW_SECONDS * 1000;
    const next = { count: 1, resetAt };
    inMemoryIpRateLimitStore.set(identifier, next);

    return {
      allowed: true,
      limit: IP_RATE_LIMIT,
      used: 1,
      remaining: getRemaining(IP_RATE_LIMIT, 1),
      resetInSeconds: IP_RATE_LIMIT_WINDOW_SECONDS,
      identifier,
      storage: "memory",
    };
  }

  const used = existing.count + 1;
  const next = { count: used, resetAt: existing.resetAt };
  inMemoryIpRateLimitStore.set(identifier, next);

  return {
    allowed: used <= IP_RATE_LIMIT,
    limit: IP_RATE_LIMIT,
    used,
    remaining: getRemaining(IP_RATE_LIMIT, used),
    resetInSeconds: getResetInSecondsFromResetAt(existing.resetAt),
    identifier,
    storage: "memory",
  };
}

export async function consumeIpRateLimit(
  identifier: string,
): Promise<IpRateLimitResult> {
  const redis = getRedisClient();

  if (!redis) {
    return consumeInMemoryIpRateLimit(identifier);
  }

  const key = getRateLimitKey(identifier);
  const used = await redis.incr(key);

  if (used === 1) {
    await redis.expire(key, IP_RATE_LIMIT_WINDOW_SECONDS);
  }

  const ttl = await redis.ttl(key);
  const resetInSeconds = ttl > 0 ? ttl : IP_RATE_LIMIT_WINDOW_SECONDS;

  return {
    allowed: used <= IP_RATE_LIMIT,
    limit: IP_RATE_LIMIT,
    used,
    remaining: getRemaining(IP_RATE_LIMIT, used),
    resetInSeconds,
    identifier,
    storage: "upstash",
  };
}
