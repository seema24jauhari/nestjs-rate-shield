import { SetMetadata } from '@nestjs/common';
import type { AlgoType } from '../../redis/redis.service';

export const RATE_LIMIT_KEY = 'rate_limit';

export const RateLimit = (opts: {
  limit?: number;
  window?: number;
  keyBy?: 'ip' | 'email' | 'phone';
  algorithm?: AlgoType;
} = {}) =>
  SetMetadata(RATE_LIMIT_KEY, {
    limit: opts.limit ?? 100,
    window: opts.window ?? 60,
    keyBy: opts.keyBy ?? 'ip',
    algorithm: opts.algorithm ?? 'sliding-window',
  });