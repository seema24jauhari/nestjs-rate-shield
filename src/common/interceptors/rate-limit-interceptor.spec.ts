import {
  Controller,
  Get,
  HttpCode,
  INestApplication,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RateLimit } from '../decorators/rate-limit.decorator';
import { MetricsService } from '../../metrics/metrics.service';
import { RedisService } from '../../redis/redis.service';
import { RateLimitInterceptor } from './rate-limit.interceptor';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Unique per run, so old keys in Redis never affect the tests
const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const email = (name: string) => `${name}-${run}@test.com`;

// A tiny controller, only used by these tests
@Controller('test')
@UseInterceptors(RateLimitInterceptor)
class TestController {
  @Post('limited')
  @HttpCode(200)
  @RateLimit({ limit: 3, window: 60, keyBy: 'email' })
  limited() {
    return { ok: true };
  }

  @Post('bucket')
  @HttpCode(200)
  @RateLimit({ limit: 1, window: 60, keyBy: 'email', algorithm: 'token-bucket' })
  bucket() {
    return { ok: true };
  }

  @Post('by-ip')
  @HttpCode(200)
  @RateLimit({ limit: 2, window: 60, keyBy: 'ip' })
  byIp() {
    return { ok: true };
  }

  @Get('open')
  open() {
    return { ok: true }; // no @RateLimit, so never limited
  }
}

const metricsMock = {
  allowed: { inc: jest.fn() },
  blocked: { inc: jest.fn() },
};

describe('RateLimitInterceptor (with real Redis)', () => {
  let app: INestApplication;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        RedisService,
        RateLimitInterceptor,
        { provide: ConfigService, useValue: { get: () => REDIS_URL } },
        { provide: MetricsService, useValue: metricsMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Each test sends its own X-Forwarded-For, so IP-based tests don't clash
    (app as any).set('trust proxy', true);
    await app.init();
    redis = moduleRef.get(RedisService);
  });

  afterAll(async () => {
    await app.close(); // also closes Redis (onModuleDestroy)
  });

  beforeEach(() => {
    metricsMock.allowed.inc.mockClear();
    metricsMock.blocked.inc.mockClear();
  });

  it('allows requests up to the limit and blocks the next with 429', async () => {
    const body = { email: email('limit') };

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/test/limited').send(body).expect(200);
    }

    const res = await request(app.getHttpServer()).post('/test/limited').send(body);

    expect(res.status).toBe(429);
    expect(res.body.statusCode).toBe(429);
    expect(res.body.message).toBe('Too many requests');
  });

  it('sets the X-RateLimit headers on every response', async () => {
    const body = { email: email('headers') };
    const remaining: string[] = [];

    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer()).post('/test/limited').send(body);
      expect(res.headers['x-ratelimit-limit']).toBe('3');
      expect(Number(res.headers['x-ratelimit-reset'])).toBeGreaterThan(Date.now() / 1000);
      remaining.push(res.headers['x-ratelimit-remaining']);
    }

    expect(remaining).toEqual(['2', '1', '0']);
  });

  it('sends Retry-After that matches retryAfter in the body when blocked', async () => {
    const body = { email: email('retry') };

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/test/limited').send(body);
    }
    const res = await request(app.getHttpServer()).post('/test/limited').send(body);

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(res.body.retryAfter).toBe(retryAfter);
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('counts each email separately (keyBy: email)', async () => {
    const a = { email: email('sep-a') };
    const b = { email: email('sep-b') };

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/test/limited').send(a);
    }
    await request(app.getHttpServer()).post('/test/limited').send(a).expect(429);

    // a different email is not affected
    await request(app.getHttpServer()).post('/test/limited').send(b).expect(200);
  });

  it('treats email case-insensitively, so changing the case does not bypass the limit', async () => {
    const lower = email('case');

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/test/limited').send({ email: lower });
    }

    await request(app.getHttpServer())
      .post('/test/limited')
      .send({ email: lower.toUpperCase() })
      .expect(429);
  });

  it('counts each IP separately (keyBy: ip)', async () => {
    const ipA = `10.${Math.floor(Math.random() * 200)}.1.1`;
    const ipB = `10.${Math.floor(Math.random() * 200)}.2.2`;

    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer()).post('/test/by-ip').set('X-Forwarded-For', ipA).expect(200);
    }
    await request(app.getHttpServer()).post('/test/by-ip').set('X-Forwarded-For', ipA).expect(429);
    await request(app.getHttpServer()).post('/test/by-ip').set('X-Forwarded-For', ipB).expect(200);
  });

  it('uses the token bucket when the decorator asks for it', async () => {
    const body = { email: email('bucket') };

    await request(app.getHttpServer()).post('/test/bucket').send(body).expect(200);
    const res = await request(app.getHttpServer()).post('/test/bucket').send(body);

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('never limits a route without @RateLimit', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).get('/test/open').expect(200);
    }
  });

  it('records allowed and blocked requests in the metrics', async () => {
    const body = { email: email('metrics') };

    for (let i = 0; i < 4; i++) {
      await request(app.getHttpServer()).post('/test/limited').send(body);
    }

    expect(metricsMock.allowed.inc).toHaveBeenCalledTimes(3);
    expect(metricsMock.blocked.inc).toHaveBeenCalledTimes(1);
    expect(metricsMock.blocked.inc).toHaveBeenCalledWith({ endpoint: '/test/limited' });
  });

  it('stores the counter in Redis under rate_limit:<route>:<id>', async () => {
    const id = email('key');
    await request(app.getHttpServer()).post('/test/limited').send({ email: id });

    const exists = await redis.client.exists(`rate_limit:/test/limited:${id}`);
    expect(exists).toBe(1);
  });
});

describe('RateLimitInterceptor when Redis fails (fail-open)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        RateLimitInterceptor,
        {
          provide: RedisService,
          useValue: { check: jest.fn().mockRejectedValue(new Error('Redis is down')) },
        },
        { provide: MetricsService, useValue: metricsMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false); // this test makes Redis fail on purpose, so hide the error logs
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets requests through instead of breaking the API', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/test/limited')
        .send({ email: email('failopen') })
        .expect(200);
    }
  });
});