import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';
export const RateLimit = (opts: {
  limit: number; window: number; keyBy: 'ip' | 'email' | 'phone';
}) => SetMetadata(RATE_LIMIT_KEY, opts);