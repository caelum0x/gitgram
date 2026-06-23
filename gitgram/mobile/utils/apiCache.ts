type CacheEntry<T> = {
  data: T;
  timestamp: number;
  expiresAt: number;
};

class APICache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes default

  /**
   * Get cached data if valid
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached data with optional TTL
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTTL;
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Invalidate a specific cache key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache keys matching a pattern
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get or fetch data with caching
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Prefetch and cache data in background
   */
  prefetch<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): void {
    fetcher()
      .then((data) => this.set(key, data, ttlMs))
      .catch(() => {
        // Silent fail for prefetch
      });
  }
}

// Singleton instance
export const apiCache = new APICache();

// Cache key generators
export const cacheKeys = {
  user: (userId: string) => `user:${userId}`,
  userProfile: (username: string) => `profile:${username}`,
  post: (postId: string) => `post:${postId}`,
  posts: (page: number, userId?: string) => `posts:${page}:${userId || 'feed'}`,
  comments: (postId: string, page: number) => `comments:${postId}:${page}`,
  followers: (userId: string, page: number) => `followers:${userId}:${page}`,
  following: (userId: string, page: number) => `following:${userId}:${page}`,
  notifications: (page: number) => `notifications:${page}`,
  trending: (timeframe: string) => `trending:${timeframe}`,
  insights: (days: number) => `insights:${days}`,
  stories: () => 'stories:feed',
  reels: (page: number) => `reels:${page}`,
};

// TTL constants (in milliseconds)
export const cacheTTL = {
  short: 30 * 1000, // 30 seconds
  medium: 5 * 60 * 1000, // 5 minutes
  long: 15 * 60 * 1000, // 15 minutes
  veryLong: 60 * 60 * 1000, // 1 hour
};
