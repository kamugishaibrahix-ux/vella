/**
 * LRU (Least Recently Used) Cache with TTL support
 *
 * Provides bounded in-memory caching with:
 * - Maximum entry limit (LRU eviction)
 * - TTL (time-to-live) expiration
 * - Size-based limits (for buffer/memory caches)
 * - O(1) get/set operations
 */

export interface LRUCacheOptions<K, V> {
  maxEntries: number;
  ttlMs?: number;
  maxSize?: number; // For size-based eviction (e.g., bytes)
  getSize?: (value: V) => number;
  onEvict?: (key: K, value: V, reason: "lru" | "expired" | "size") => void;
}

interface CacheEntry<V> {
  value: V;
  timestamp: number;
  size: number;
}

/**
 * LRU Cache implementation with TTL and size limits
 */
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxEntries: number;
  private ttlMs: number | null;
  private maxSize: number | null;
  private getSize: (value: V) => number;
  private onEvict?: (key: K, value: V, reason: "lru" | "expired" | "size") => void;
  private currentSize = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: LRUCacheOptions<K, V>) {
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs ?? null;
    this.maxSize = options.maxSize ?? null;
    this.getSize = options.getSize ?? (() => 1);
    this.onEvict = options.onEvict;

    // Setup periodic cleanup if TTL is enabled
    if (this.ttlMs) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpired();
      }, Math.min(this.ttlMs, 60000)); // Cleanup at least every minute

      // Ensure cleanup doesn't prevent process exit
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  /**
   * Get value from cache (updates LRU order)
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL expiration
    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });

    return entry.value;
  }

  /**
   * Set value in cache (handles eviction)
   */
  set(key: K, value: V): void {
    const size = this.getSize(value);

    // Check if single item exceeds max size
    if (this.maxSize && size > this.maxSize) {
      // Item too large, don't cache
      this.onEvict?.(key, value, "size");
      return;
    }

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict entries by size if needed
    while (
      this.maxSize &&
      this.currentSize + size > this.maxSize &&
      this.cache.size > 0
    ) {
      this.evictLRU("size");
    }

    // Evict by count if needed
    while (this.cache.size >= this.maxEntries) {
      this.evictLRU("lru");
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      size,
    });
    this.currentSize += size;
  }

  /**
   * Delete entry from cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.currentSize -= entry.size;
    return true;
  }

  /**
   * Check if key exists (does not update LRU)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check TTL
    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get current size (entry count)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get total byte size (if size tracking enabled)
   */
  get byteSize(): number {
    return this.currentSize;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Get all keys (for debugging/monitoring)
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(reason: "lru" | "size"): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey === undefined) {
      return;
    }

    const entry = this.cache.get(firstKey)!;
    this.cache.delete(firstKey);
    this.currentSize -= entry.size;

    this.onEvict?.(firstKey, entry.value, reason);
  }

  /**
   * Cleanup expired entries
   */
  private cleanupExpired(): void {
    if (!this.ttlMs) {
      return;
    }

    const now = Date.now();
    const expired: K[] = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      const entry = this.cache.get(key);
      if (entry) {
        this.delete(key);
        this.onEvict?.(key, entry.value, "expired");
      }
    }
  }

  /**
   * Destroy cache and cleanup timers
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

/**
 * Create a bounded Map that auto-evicts old entries
 * Simple wrapper for basic use cases
 */
export function createBoundedMap<K, V>(
  maxEntries: number,
  ttlMs?: number
): Map<K, V> {
  const map = new Map<K, V>();
  let cleanupTimer: NodeJS.Timeout | null = null;

  const originalSet = map.set.bind(map);
  const originalDelete = map.delete.bind(map);

  // Track timestamps for TTL
  const timestamps = new Map<K, number>();

  // Override set to handle eviction
  map.set = (key: K, value: V) => {
    // Remove if exists (to update order)
    if (map.has(key)) {
      map.delete(key);
    }

    // Evict oldest if at capacity
    while (map.size >= maxEntries) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) {
        map.delete(firstKey);
      }
    }

    // Set new value
    originalSet(key, value);
    timestamps.set(key, Date.now());

    return map;
  };

  // Override delete to cleanup timestamps
  map.delete = (key: K) => {
    timestamps.delete(key);
    return originalDelete(key);
  };

  // Override get to check TTL
  const originalGet = map.get.bind(map);
  map.get = (key: K) => {
    if (ttlMs && timestamps.has(key)) {
      const timestamp = timestamps.get(key)!;
      if (Date.now() - timestamp > ttlMs) {
        map.delete(key);
        return undefined;
      }
    }
    return originalGet(key);
  };

  // Setup periodic cleanup if TTL enabled
  if (ttlMs) {
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of timestamps) {
        if (now - timestamp > ttlMs) {
          map.delete(key);
        }
      }
    }, Math.min(ttlMs, 60000));

    if (cleanupTimer.unref) {
      cleanupTimer.unref();
    }
  }

  // Attach cleanup method
  (map as any).destroy = () => {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
    }
    map.clear();
    timestamps.clear();
  };

  return map;
}
