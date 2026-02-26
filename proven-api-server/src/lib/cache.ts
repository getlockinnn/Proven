type CacheValue<T> = {
  value: T
  expiresAt: number
}

class MemoryCache {
  private store = new Map<string, CacheValue<any>>()

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  del(key: string): void {
    this.store.delete(key)
  }
}

export const cache = new MemoryCache()


