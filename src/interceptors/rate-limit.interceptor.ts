import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private redis: RedisService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler) {
    // const opts = this.reflector.get(RATE_LIMIT_KEY, ctx.getHandler());
    // if (!opts) return next.handle();

    // const req = ctx.switchToHttp().getRequest();
    // const res = ctx.switchToHttp().getResponse();
    // const id = opts.keyBy === 'ip' ? req.ip : req.body?.[opts.keyBy];
    // const key = `rate_limit:${req.route.path}:${id}`;

    // let allowed = true;
    // try {
    //   allowed = await this.redis.slidingWindow(key, opts.limit, opts.window);
    // } catch (e) {
    //   allowed = true; // fail-open: if Redis is down, don't break the API
    // }

    // if (!allowed) {
    //   res.setHeader('Retry-After', opts.window);
    //   throw new HttpException(
    //     { statusCode: 429, message: 'Too many requests', retryAfter: opts.window }, 429);
    // }
    return next.handle();
  }
}