import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RedisModule = typeof import('@/lib/redis/client');

class FakeRedis {
  static lastInstance: FakeRedis | null = null;
  static connectShouldFail = false;

  store = new Map<string, string>();
  handlers = new Map<string, () => void>();
  options: Record<string, any>;
  getCalls: string[] = [];
  setCalls: Array<[string, string, string, number]> = [];
  delCalls: string[] = [];
  getShouldThrow = false;
  setShouldThrow = false;

  constructor(options: Record<string, any>) {
    this.options = options;
    FakeRedis.lastInstance = this;
  }

  on(event: string, handler: () => void) {
    this.handlers.set(event, handler);
  }

  async connect() {
    if (FakeRedis.connectShouldFail) {
      this.handlers.get('error')?.();
      throw new Error('ECONNREFUSED');
    }
    this.handlers.get('connect')?.();
  }

  async get(key: string) {
    this.getCalls.push(key);
    if (this.getShouldThrow) throw new Error('redis get failed');
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, mode: string, ttl: number) {
    this.setCalls.push([key, value, mode, ttl]);
    if (this.setShouldThrow) throw new Error('redis set failed');
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string) {
    this.delCalls.push(key);
    this.store.delete(key);
    return 1;
  }
}

const loadCacheModule = async (): Promise<RedisModule> => {
  vi.resetModules();
  vi.doMock('ioredis', () => ({ default: FakeRedis }));
  return import('@/lib/redis/client');
};

beforeEach(() => {
  FakeRedis.lastInstance = null;
  FakeRedis.connectShouldFail = false;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('ioredis');
});

describe('getOrSetCache with Redis available', () => {
  let cache: RedisModule;
  let redis: FakeRedis;

  beforeEach(async () => {
    cache = await loadCacheModule();
    await Promise.resolve();
    redis = FakeRedis.lastInstance!;
  });

  it('configures a fast-failing lazy local Redis connection', () => {
    expect(redis.options).toMatchObject({
      host: '127.0.0.1',
      port: 6379,
      connectTimeout: 500,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  });

  it('fetches, caches and then serves subsequent reads from cache', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ wabas: 2 });

    expect(await cache.getOrSetCache('assets', fetchFn, 60)).toEqual({ wabas: 2 });
    expect(redis.setCalls).toEqual([['assets', JSON.stringify({ wabas: 2 }), 'EX', 60]]);

    expect(await cache.getOrSetCache('assets', fetchFn, 60)).toEqual({ wabas: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache when forceRefresh is set', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await cache.getOrSetCache('key', fetchFn);
    expect(await cache.getOrSetCache('key', fetchFn, 300, true)).toBe('second');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('falls back to the in-memory LRU when a Redis read throws', async () => {
    const fetchFn = vi.fn().mockResolvedValue('value');
    await cache.getOrSetCache('lru-key', fetchFn);

    redis.getShouldThrow = true;
    expect(await cache.getOrSetCache('lru-key', fetchFn)).toBe('value');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('still returns fresh data when the Redis write throws', async () => {
    redis.setShouldThrow = true;

    await expect(cache.getOrSetCache('write-fail', async () => 'fresh')).resolves.toBe('fresh');
  });

  it('does not cache null or undefined results', async () => {
    const nullFetch = vi.fn().mockResolvedValue(null);
    await cache.getOrSetCache('null-key', nullFetch);
    await cache.getOrSetCache('null-key', nullFetch);

    expect(nullFetch).toHaveBeenCalledTimes(2);
    expect(redis.setCalls).toHaveLength(0);
  });

  it('propagates fetch errors to the caller', async () => {
    await expect(cache.getOrSetCache('boom', async () => { throw new Error('upstream down'); })).rejects.toThrow(
      'upstream down'
    );
  });

  it('invalidateCacheKey clears both Redis and the LRU copy', async () => {
    const fetchFn = vi.fn().mockResolvedValue('v1');
    await cache.getOrSetCache('drop-me', fetchFn);

    await cache.invalidateCacheKey('drop-me');

    expect(redis.delCalls).toEqual(['drop-me']);
    await cache.getOrSetCache('drop-me', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('getOrSetCache without Redis', () => {
  let cache: RedisModule;

  beforeEach(async () => {
    FakeRedis.connectShouldFail = true;
    cache = await loadCacheModule();
    await Promise.resolve();
  });

  it('serves everything from the LRU fallback', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['template']);

    expect(await cache.getOrSetCache('templates', fetchFn)).toEqual(['template']);
    expect(await cache.getOrSetCache('templates', fetchFn)).toEqual(['template']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(FakeRedis.lastInstance!.getCalls).toEqual([]);
    expect(FakeRedis.lastInstance!.setCalls).toEqual([]);
  });

  it('invalidates LRU entries without touching Redis', async () => {
    const fetchFn = vi.fn().mockResolvedValue('cached');
    await cache.getOrSetCache('key', fetchFn);

    await cache.invalidateCacheKey('key');
    await cache.getOrSetCache('key', fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(FakeRedis.lastInstance!.delCalls).toEqual([]);
  });
});
