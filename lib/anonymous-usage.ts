const MESSAGE_CAP = 5;

type UsageRecord = {
  count: number;
  createdAt: number;
};

declare global {
  var __anonymousUsageStore__: Map<string, UsageRecord> | undefined;
}

const usageStore = globalThis.__anonymousUsageStore__ ?? new Map<string, UsageRecord>();

globalThis.__anonymousUsageStore__ = usageStore;

export function getAnonymousMessageCap() {
  return MESSAGE_CAP;
}

export function getAnonymousUsage(anonymousId: string) {
  return usageStore.get(anonymousId) ?? { count: 0, createdAt: Date.now() };
}

export function hasReachedAnonymousCap(anonymousId: string) {
  return getAnonymousUsage(anonymousId).count >= MESSAGE_CAP;
}

export function incrementAnonymousUsage(anonymousId: string) {
  const current = getAnonymousUsage(anonymousId);
  const next: UsageRecord = {
    count: current.count + 1,
    createdAt: current.createdAt,
  };

  usageStore.set(anonymousId, next);

  return next;
}
