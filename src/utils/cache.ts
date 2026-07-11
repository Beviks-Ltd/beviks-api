type CacheEntry = {
  data: any;
  expiresAt: number;
};

const cacheStore = new Map<string, CacheEntry>();

export const cache = {
  get(key: string): any | null {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cacheStore.delete(key);
      return null;
    }
    return entry.data;
  },
  set(key: string, data: any, ttlMs: number = 60000): void {
    cacheStore.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    });
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
