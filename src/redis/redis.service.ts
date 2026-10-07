import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';

export type AlgoType = 'sliding-window' | 'token-bucket';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number; // calls (or tokens) left
  resetAfter: number; // seconds until a slot frees up, also used for Retry-After
}
 
@Injectable()
export class RedisService implements OnModuleDestroy {
  private client!: Redis;
  private scripts = new Map<string, string>();

  constructor(config: ConfigService) {
    const redisUri = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(redisUri, { maxRetriesPerRequest: 1 });
    this.client.on('error', (e) => console.error('Redis error:', e.message || e));  
  }

  private toResult(raw: unknown): RateLimitResult {
    const [allowed, remaining, resetAfter] = raw as number[];
    return { allowed: allowed === 1, remaining, resetAfter };
  }
 
  // Reads a Lua file the first time it is needed, then reuses it from memory
  private loadScript(name: string): string {
    let script = this.scripts.get(name);
    if (!script) {
      script = readFileSync(
        join(process.cwd(), 'src/redis/lua-scripts', name),
        'utf8',
      );
      this.scripts.set(name, script);
    }

    return script;
  }

  async slidingWindow(
    key: string,
    limit: number,
    windowSec: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const raw = await this.client.eval(
      this.loadScript('sliding-window.lua'),
      1,
      key,
      now,
      windowSec,
      limit,
      `${now}-${Math.random()}`, // unique member for this request
    );
    return this.toResult(raw);
  }

  async tokenBucket(
    key: string,
    capacity: number,
    refillRate: number, // tokens per second
    requested = 1, // tokens this request uses
  ): Promise<RateLimitResult> {
    const now = Date.now();
     const raw = await this.client.eval(
      this.loadScript('token-bucket.lua'),
      1,
      key,
      capacity,
      refillRate,
      now,
      requested,
    );
    return this.toResult(raw);    
  }

  // Interceptor calls this one; it picks the algorithm
  async check(
    key: string,
    limit: number,
    windowSec: number,
    algorithm: AlgoType = 'sliding-window',
  ): Promise<RateLimitResult> {
    if (algorithm === 'token-bucket') {
      return this.tokenBucket(key, limit, limit / windowSec);
    }
    return this.slidingWindow(key, limit, windowSec);
  }

  async onModuleDestroy() {
    await this.client.quit(); // close the connection when the app stops
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }
  
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async sadd(key: string, value: string): Promise<void> {
    await this.client.sadd(key, value);
  }
  
  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async srem(key: string, value: string): Promise<number> {
    return this.client.srem(key, value);
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.client.mget(...keys);
  } 

  async sismember(key: string, value: string): Promise<number> {
    return this.client.sismember(key, value);
  }

}