import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitResult, RedisService } from '../../redis/redis.service';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);

  constructor(
    private reflector: Reflector,
    private redis: RedisService,
    private metrics: MetricsService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler) {
    // Read the rule that @RateLimit() attached to this route
    const opts = this.reflector.get(RATE_LIMIT_KEY, ctx.getHandler());
    if (!opts) return next.handle(); // no rule on this route, skip

    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    // Who is calling? Fall back to IP if the body field is missing
    const raw = opts.keyBy === 'ip' ? req.ip : req.body?.[opts.keyBy];
    const id = String(raw ?? req.ip).toLowerCase();
    const endpoint = req.route.path;
    const key = `rate_limit:${req.route.path}:${id}`;

    let result: RateLimitResult | null = null;
    try {
      result = await this.redis.check(
        key,
        opts.limit,
        opts.window,
        opts.algorithm,
      );
    } catch (e) {
      // fail-open: if Redis is down, don't break the API
      this.logger.error(`Rate limit check failed: ${(e as Error).message}`);
    }

     // Headers on every response (skipped only when Redis failed)
    if (result) {
      res.setHeader('X-RateLimit-Limit', opts.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader(
        'X-RateLimit-Reset',
        Math.ceil(Date.now() / 1000) + result.resetAfter, // Unix seconds
      );
    }
 
    if (result && !result.allowed) {
      this.metrics.blocked.inc({ endpoint });
      this.logger.warn(`Blocked ${key}`);
      res.setHeader('Retry-After', result.resetAfter);
      throw new HttpException(
        {
          statusCode: 429,
          message: 'Too many requests',
          retryAfter: result.resetAfter,
        },
        429,
      );
    }
 
    this.metrics.allowed.inc({ endpoint });
    return next.handle();
  }
}