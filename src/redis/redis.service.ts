import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'rxjs/internal/config';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService {
    client: Redis;   // <- this line declares the property

    constructor(config: ConfigService) {
        this.client = new Redis({
            host: config.get('REDIS_HOST'),
            port: Number(config.get('REDIS_PORT')),
        });
    }

  async slidingWindow(key: string, limit: number, windowSec: number): Promise<boolean> {

    const script = readFileSync(
      join(process.cwd(), 'src/redis/lua-scripts/sliding-window.lua'), 'utf8');
    const now = Date.now();
    const result = await this.client.eval(
      script, 1, key, now, windowSec, limit, `${now}-${Math.random()}`);
    return result === 1; // 1 = allowed, 0 = blocked
  }
}