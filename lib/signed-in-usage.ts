import { getRedisClient } from "@/lib/upstash";

const SIGNED_IN_FREE_MESSAGE_CAP = 25;
const KEY_PREFIX = "signed_in_usage";

type UserUsageRecord = {
  count: number;
  createdAt: number;
};

declare global {
  var __signedInUsageStore__: Map<string, UserUsageRecord> | undefined;
}

const inMemorySignedInUsageStore =
  globalThis.__signedInUsageStore__ ?? new Map<string, UserUsageRecord>();

globalThis.__signedInUsageStore__ = inMemorySignedInUsageStore;

function getRedisKey(userId: string) {
  return `${KEY_PREFIX}:${userId}`;
}

function getInMemoryUsage(userId: string) {
  return (
    inMemorySignedInUsageStore.get(userId) ?? {
      count: 0,
      createdAt: Date.now(),
    }
  );
}

function incrementInMemoryUsage(userId: string) {
  const current = getInMemoryUsage(userId);
  const next: UserUsageRecord = {
    count: current.count + 1,
    createdAt: current.createdAt,
  };

  inMemorySignedInUsageStore.set(userId, next);
  return next;
}

export function getSignedInFreeMessageCap() {
  return SIGNED_IN_FREE_MESSAGE_CAP;
}

export function getSignedInUsageProvider() {
  return getRedisClient() ? "upstash" : "memory";
}

export function getSignedInUserId(email: string) {
  return email.trim().toLowerCase();
}

export async function getSignedInUsage(
  userId: string,
): Promise<UserUsageRecord> {
  const redis = getRedisClient();

  if (!redis) {
    return getInMemoryUsage(userId);
  }

  const record = await redis.hgetall<Record<string, string | number>>(
    getRedisKey(userId),
  );

  if (!record || Object.keys(record).length === 0) {
    return { count: 0, createdAt: Date.now() };
  }

  return {
    count: Number(record.count ?? 0),
    createdAt: Number(record.createdAt ?? Date.now()),
  };
}

export async function hasReachedSignedInCap(userId: string) {
  const usage = await getSignedInUsage(userId);
  return usage.count >= SIGNED_IN_FREE_MESSAGE_CAP;
}

export async function incrementSignedInUsage(
  userId: string,
): Promise<UserUsageRecord> {
  const redis = getRedisClient();

  if (!redis) {
    return incrementInMemoryUsage(userId);
  }

  const key = getRedisKey(userId);
  const createdAt = Date.now();

  await redis.hsetnx(key, "createdAt", createdAt);
  const count = await redis.hincrby(key, "count", 1);
  const usage = await getSignedInUsage(userId);

  return {
    count,
    createdAt: usage.createdAt,
  };
}
