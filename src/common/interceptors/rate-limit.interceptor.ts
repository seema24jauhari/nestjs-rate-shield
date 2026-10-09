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
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { Request, Response } from 'express';
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);

  constructor(
    private reflector: Reflector,
    private redis: RedisService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler) {
    // Read the rule that @RateLimit() attached to this route
    const opts = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      ctx.getHandler(),
    );
    if (!opts) return next.handle(); // no rule on this route, skip

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    // Who is calling? Fall back to IP if the body field is missing
    const raw =
      opts.keyBy === 'ip'
        ? req.ip
        : (req.body as Record<string, unknown>)?.[opts.keyBy];
    const id =
      typeof raw === 'string' || typeof raw === 'number'
        ? String(raw).toLowerCase()
        : req.ip;
    const endpoint = req.path;
    const key = `rate_limit:${endpoint}:${id}`;

    let result: RateLimitResult | null = null;
    try {
      result = await this.redis.check(
        key,
        opts.limit,
        opts.window,
        opts.algorithm,
      );
    } catch (e: unknown) {
      // fail-open: if Redis is down, don't break the API
      this.logger.error(
        `Rate limit check failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
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

    return next.handle();
  }
}
