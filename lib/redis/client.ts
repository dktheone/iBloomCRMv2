import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';

// In-Memory Fallback LRU Cache (Capped at 500 items, 5-minute TTL)
const lruFallback = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 5,
});

let redisClient: Redis | null = null;
let isRedisAvailable = false;

// Attempt connecting to Local Redis (127.0.0.1:6379) on VPS
try {
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

  redisClient = new Redis({
    host: redisHost,
    port: redisPort,
    connectTimeout: 500, // Quick fallback if Redis is not running locally
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  redisClient.on('connect', () => {
    isRedisAvailable = true;
    console.log('[Redis] Connected to Local Redis Gateway on 127.0.0.1:6379');
  });

  redisClient.on('error', () => {
    isRedisAvailable = false;
  });

  redisClient.connect().catch(() => {
    isRedisAvailable = false;
  });
} catch {
  isRedisAvailable = false;
}

/**
 * Unified Cache Helper: Queries Local Redis (VPS) or Fallback RAM LRU Cache
 */
export async function getOrSetCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = 300,
  forceRefresh: boolean = false
): Promise<T> {
  if (!forceRefresh) {
    // 1. Check Local Redis if connected
    if (isRedisAvailable && redisClient) {
      try {
        const cachedRaw = await redisClient.get(key);
        if (cachedRaw) {
          return JSON.parse(cachedRaw) as T;
        }
      } catch {
        // Fallthrough to LRU
      }
    }

    // 2. Check LRU Fallback
    const cachedLru = lruFallback.get(key);
    if (cachedLru !== undefined) {
      return cachedLru as T;
    }
  }

  // 3. Cache Miss: Execute fresh fetch
  const freshData = await fetchFn();

  if (freshData !== null && freshData !== undefined) {
    // Save to LRU Fallback
    lruFallback.set(key, freshData, { ttl: ttlSeconds * 1000 });

    // Save to Local Redis if connected
    if (isRedisAvailable && redisClient) {
      try {
        await redisClient.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
      } catch {}
    }
  }

  return freshData;
}

/**
 * Invalidate a specific cache key
 */
export async function invalidateCacheKey(key: string) {
  lruFallback.delete(key);
  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.del(key);
    } catch {}
  }
}
