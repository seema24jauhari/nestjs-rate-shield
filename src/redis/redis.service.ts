import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';

export type AlgoType = 'sliding-window' | 'token-bucket';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client!: Redis;
  private scripts = new Map<string, string>();

  constructor(config: ConfigService) {
    const redisUri =  config.get<string>('REDIS_URI') ?? 'redis://localhost:6379';
    this.client = new Redis(redisUri);

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
  ): Promise<boolean> {
    const now = Date.now();
    const result = await this.client.eval(
      this.loadScript('sliding-window.lua'),
      1,
      key,
      now,
      windowSec,
      limit,
      `${now}-${Math.random()}`, // unique member for this request
    );
    return result === 1; // 1 = allowed, 0 = blocked
  }

  async tokenBucket(
    key: string,
    capacity: number,
    refillRate: number, // tokens per second
  ): Promise<boolean> {
    const now = Date.now();
    const result = await this.client.eval(
      this.loadScript('token-bucket.lua'),
      1,
      key,
      capacity,
      refillRate,
      now,
    );
    return result === 1;
  }

  // Interceptor calls this one; it picks the algorithm
  async check(
    key: string,
    limit: number,
    windowSec: number,
    algorithm: AlgoType = 'sliding-window',
  ): Promise<boolean> {
    if (algorithm === 'token-bucket') {
      return this.tokenBucket(key, limit, limit / windowSec);
    }
    return this.slidingWindow(key, limit, windowSec);
  }

  async onModuleDestroy() {
    await this.client.quit(); // close the connection when the app stops
  }
}