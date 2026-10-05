import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);

  constructor(
    private reflector: Reflector,
    private redis: RedisService,
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
    const key = `rate_limit:${req.route.path}:${id}`;

    let allowed = true;
    try {
      allowed = await this.redis.check(
        key,
        opts.limit,
        opts.window,
        opts.algorithm,
      );
    } catch (e) {
      // fail-open: if Redis is down, don't break the API
      this.logger.error(`Rate limit check failed: ${(e as Error).message}`);
      allowed = true;
    }

    if (!allowed) {
      this.logger.warn(`Blocked ${key}`);
      res.setHeader('Retry-After', opts.window);
      throw new HttpException(
        {
          statusCode: 429,
          message: 'Too many requests',
          retryAfter: opts.window,
        },
        429,
      );
    }

    return next.handle();
  }
}