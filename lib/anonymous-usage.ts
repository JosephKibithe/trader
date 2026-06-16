import { getRedisClient } from "@/lib/upstash";

const MESSAGE_CAP = 5;
const KEY_PREFIX = "anonymous_usage";

type UsageRecord = {
  count: number;
  createdAt: number;
};

declare global {
  var __anonymousUsageStore__: Map<string, UsageRecord> | undefined;
}

const inMemoryUsageStore =
  globalThis.__anonymousUsageStore__ ?? new Map<string, UsageRecord>();

globalThis.__anonymousUsageStore__ = inMemoryUsageStore;

function getRedisKey(anonymousId: string) {
  return `${KEY_PREFIX}:${anonymousId}`;
}

function getInMemoryUsage(anonymousId: string) {
  return (
    inMemoryUsageStore.get(anonymousId) ?? { count: 0, createdAt: Date.now() }
  );
}

function incrementInMemoryUsage(anonymousId: string) {
  const current = getInMemoryUsage(anonymousId);
  const next: UsageRecord = {
    count: current.count + 1,
    createdAt: current.createdAt,
  };

  inMemoryUsageStore.set(anonymousId, next);
  return next;
}

export function getAnonymousMessageCap() {
  return MESSAGE_CAP;
}

export function getAnonymousUsageProvider() {
  return getRedisClient() ? "upstash" : "memory";
}

export async function getAnonymousUsage(
  anonymousId: string,
): Promise<UsageRecord> {
  const redis = getRedisClient();

  if (!redis) {
    return getInMemoryUsage(anonymousId);
  }

  const record = await redis.hgetall<Record<string, string | number>>(
    getRedisKey(anonymousId),
  );

  if (!record || Object.keys(record).length === 0) {
    return { count: 0, createdAt: Date.now() };
  }

  return {
    count: Number(record.count ?? 0),
    createdAt: Number(record.createdAt ?? Date.now()),
  };
}

export async function hasReachedAnonymousCap(anonymousId: string) {
  const usage = await getAnonymousUsage(anonymousId);
  return usage.count >= MESSAGE_CAP;
}

export async function incrementAnonymousUsage(
  anonymousId: string,
): Promise<UsageRecord> {
  const redis = getRedisClient();

  if (!redis) {
    return incrementInMemoryUsage(anonymousId);
  }

  const key = getRedisKey(anonymousId);
  const createdAt = Date.now();

  await redis.hsetnx(key, "createdAt", createdAt);
  const count = await redis.hincrby(key, "count", 1);
  const usage = await getAnonymousUsage(anonymousId);

  return {
    count,
    createdAt: usage.createdAt,
  };
}
