type CacheEntry = {
  data: any;
  expiresAt: number;
  lastAccessedAt: number;
};

const cacheStore = new Map<string, CacheEntry>();
const maxEntries = Number(process.env.RESPONSE_CACHE_MAX_ENTRIES || 500);

function pruneExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cacheStore.entries()) {
    if (now > entry.expiresAt) {
      cacheStore.delete(key);
    }
  }
}

function enforceMaxEntries(): void {
  if (cacheStore.size <= maxEntries) return;

  const entriesByAccess = [...cacheStore.entries()].sort(
    ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt
  );
  const deleteCount = cacheStore.size - maxEntries;

  for (let i = 0; i < deleteCount; i += 1) {
    const [key] = entriesByAccess[i];
    cacheStore.delete(key);
  }
}

export const cache = {
  get(key: string): any | null {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cacheStore.delete(key);
      return null;
    }
    entry.lastAccessedAt = Date.now();
    return entry.data;
  },
  set(key: string, data: any, ttlMs: number = 60000): void {
    pruneExpiredEntries();
    cacheStore.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      lastAccessedAt: Date.now()
    });
    enforceMaxEntries();
  },
  delete(key: string): void {
    cacheStore.delete(key);
  },
  deletePattern(prefix: string): void {
    for (const key of cacheStore.keys()) {
      if (key.startsWith(prefix)) {
        cacheStore.delete(key);
      }
    }
  },
  clear(): void {
    cacheStore.clear();
  }
};
