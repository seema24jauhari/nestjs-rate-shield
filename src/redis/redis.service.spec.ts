import { ConfigService } from '@nestjs/config';
import { RateLimitResult, RedisService } from './redis.service';

// These tests talk to a REAL Redis (Lua scripts cannot be tested with mocks).
// Locally: docker run -d -p 6379:6379 redis:7-alpine
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A unique key per test, so tests never affect each other or old data
const uniqueKey = (name: string) =>
  `test:${name}:${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('RedisService', () => {
  let service: RedisService;

  beforeAll(() => {
    const config = { get: () => REDIS_URL } as unknown as ConfigService;
    service = new RedisService(config);
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  describe('slidingWindow', () => {
    it('allows requests up to the limit, then blocks the next one', async () => {
      const key = uniqueKey('sw-limit');

      for (let i = 1; i <= 3; i++) {
        const res = await service.slidingWindow(key, 3, 60);
        expect(res.allowed).toBe(true);
      }

      const blocked = await service.slidingWindow(key, 3, 60);
      expect(blocked.allowed).toBe(false);
    });

    it('reports the remaining calls correctly', async () => {
      const key = uniqueKey('sw-remaining');

      const first = await service.slidingWindow(key, 3, 60);
      const second = await service.slidingWindow(key, 3, 60);
      const third = await service.slidingWindow(key, 3, 60);
      const fourth = await service.slidingWindow(key, 3, 60);

      expect([first.remaining, second.remaining, third.remaining]).toEqual([2, 1, 0]);
      expect(fourth.remaining).toBe(0);
    });

    it('returns a sensible resetAfter when blocked', async () => {
      const key = uniqueKey('sw-reset');

      await service.slidingWindow(key, 1, 60);
      const blocked = await service.slidingWindow(key, 1, 60);

      expect(blocked.allowed).toBe(false);
      expect(blocked.resetAfter).toBeGreaterThanOrEqual(1);
      expect(blocked.resetAfter).toBeLessThanOrEqual(60);
    });

    it('allows requests again after the window has passed', async () => {
      const key = uniqueKey('sw-slide');

      await service.slidingWindow(key, 1, 1); // window = 1 second
      const blocked = await service.slidingWindow(key, 1, 1);
      expect(blocked.allowed).toBe(false);

      await sleep(1200);

      const again = await service.slidingWindow(key, 1, 1);
      expect(again.allowed).toBe(true);
    });

    it('keeps different keys separate', async () => {
      const keyA = uniqueKey('sw-a');
      const keyB = uniqueKey('sw-b');

      await service.slidingWindow(keyA, 1, 60);
      const blockedA = await service.slidingWindow(keyA, 1, 60);
      const allowedB = await service.slidingWindow(keyB, 1, 60);

      expect(blockedA.allowed).toBe(false);
      expect(allowedB.allowed).toBe(true);
    });

    it('is atomic: 20 parallel requests with limit 5 allow exactly 5', async () => {
      const key = uniqueKey('sw-race');

      const results = await Promise.all(
        Array.from({ length: 20 }, () => service.slidingWindow(key, 5, 60)),
      );

      expect(results.filter((r) => r.allowed)).toHaveLength(5);
      expect(results.filter((r) => !r.allowed)).toHaveLength(15);
    });

    it('sets an expiry so idle keys clean themselves up', async () => {
      const key = uniqueKey('sw-ttl');

      await service.slidingWindow(key, 3, 30);
      const ttl = await service.client.ttl(key);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    });
  });

  describe('tokenBucket', () => {
    it('allows a request when the bucket is full, then blocks the next', async () => {
      const key = uniqueKey('tb-basic');

      // capacity 1, refills very slowly (1 token per 1000 s)
      const first = await service.tokenBucket(key, 1, 0.001);
      const second = await service.tokenBucket(key, 1, 0.001);

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(false);
    });

    it('allows a burst up to the capacity', async () => {
      const key = uniqueKey('tb-burst');

      const results: RateLimitResult[] = [];
      for (let i = 0; i < 4; i++) {
        results.push(await service.tokenBucket(key, 3, 0.001));
      }

      expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    });

    it('refills tokens over time', async () => {
      const key = uniqueKey('tb-refill');

      // capacity 1, refill 2 tokens per second (one token every 0.5 s)
      await service.tokenBucket(key, 1, 2);
      const blocked = await service.tokenBucket(key, 1, 2);
      expect(blocked.allowed).toBe(false);

      await sleep(700);

      const again = await service.tokenBucket(key, 1, 2);
      expect(again.allowed).toBe(true);
    });

    it('never refills above the capacity', async () => {
      const key = uniqueKey('tb-cap');

      await service.tokenBucket(key, 2, 100); // uses 1 token, 1 left
      await sleep(300); // without a cap this would add about 30 tokens

      const res = await service.tokenBucket(key, 2, 100);

      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(1); // capped at 2, minus the 1 just used
    });

    it('returns an exact wait time when blocked', async () => {
      const key = uniqueKey('tb-wait');

      // capacity 1, refill 1 token per 30 s
      await service.tokenBucket(key, 1, 1 / 30);
      const blocked = await service.tokenBucket(key, 1, 1 / 30);

      expect(blocked.allowed).toBe(false);
      expect(blocked.resetAfter).toBeGreaterThan(0);
      expect(blocked.resetAfter).toBeLessThanOrEqual(30);
    });

    it('is atomic: 10 parallel requests with capacity 3 allow exactly 3', async () => {
      const key = uniqueKey('tb-race');

      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.tokenBucket(key, 3, 0.001)),
      );

      expect(results.filter((r) => r.allowed)).toHaveLength(3);
    });
  });

  describe('check', () => {
    it('uses sliding window by default', async () => {
      const key = uniqueKey('check-default');

      await service.check(key, 1, 60);
      const blocked = await service.check(key, 1, 60);

      expect(blocked.allowed).toBe(false);
      expect(await service.client.type(key)).toBe('zset'); // sorted set = sliding window
    });

    it('uses token bucket when asked', async () => {
      const key = uniqueKey('check-bucket');

      await service.check(key, 1, 60, 'token-bucket');

      expect(await service.client.type(key)).toBe('hash'); // hash = token bucket
    });
  });
});