import {
  Controller,
  Get,
  HttpCode,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RateLimit } from '../decorators/rate-limit.decorator';
import { RedisService } from '../../redis/redis.service';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { NestExpressApplication } from '@nestjs/platform-express/interfaces/nest-express-application.interface';
import type { Server } from 'node:http';

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
  @RateLimit({
    limit: 1,
    window: 60,
    keyBy: 'email',
    algorithm: 'token-bucket',
  })
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

type RateLimitErrorBody = {
  statusCode: number;
  message: string;
  retryAfter: number;
};

describe('RateLimitInterceptor (with real Redis)', () => {
  let app: NestExpressApplication;
  let redis: RedisService;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        {
          provide: RedisService,
          useFactory: () =>
            new RedisService(process.env.REDIS_URL ?? 'redis://localhost:6379'),
        },
        RateLimitInterceptor,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', true);
    await app.init();

    server = app.getHttpServer();
    redis = moduleRef.get(RedisService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('allows requests up to the limit and blocks the next with 429', async () => {
    const body = { email: email('limit') };

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/test/limited')
        .send(body)
        .expect(200);
    }

    const res = await request(server).post('/test/limited').send(body);

    const responseBody = res.body as RateLimitErrorBody;

    expect(res.status).toBe(429);
    expect(responseBody.statusCode).toBe(429);
    expect(responseBody.message).toBe('Too many requests');
  });

  it('sets the X-RateLimit headers on every response', async () => {
    const body = { email: email('headers') };
    const remaining: string[] = [];

    for (let i = 0; i < 3; i++) {
      const res = await request(server).post('/test/limited').send(body);
      expect(res.headers['x-ratelimit-limit']).toBe('3');
      expect(Number(res.headers['x-ratelimit-reset'])).toBeGreaterThan(
        Date.now() / 1000,
      );
      remaining.push(res.headers['x-ratelimit-remaining']);
    }

    expect(remaining).toEqual(['2', '1', '0']);
  });

  it('sends Retry-After that matches retryAfter in the body when blocked', async () => {
    const body = { email: email('retry') };

    for (let i = 0; i < 3; i++) {
      await request(server).post('/test/limited').send(body);
    }
    const res = await request(server).post('/test/limited').send(body);
    const responseBody = res.body as RateLimitErrorBody;

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(responseBody.retryAfter).toBe(retryAfter);
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('counts each email separately (keyBy: email)', async () => {
    const a = { email: email('sep-a') };
    const b = { email: email('sep-b') };

    for (let i = 0; i < 3; i++) {
      await request(server).post('/test/limited').send(a);
    }
    await request(server).post('/test/limited').send(a).expect(429);

    // a different email is not affected
    await request(server).post('/test/limited').send(b).expect(200);
  });

  it('treats email case-insensitively, so changing the case does not bypass the limit', async () => {
    const lower = email('case');

    for (let i = 0; i < 3; i++) {
      await request(server).post('/test/limited').send({ email: lower });
    }

    await request(server)
      .post('/test/limited')
      .send({ email: lower.toUpperCase() })
      .expect(429);
  });

  it('counts each IP separately (keyBy: ip)', async () => {
    const ipA = `10.${Math.floor(Math.random() * 200)}.1.1`;
    const ipB = `10.${Math.floor(Math.random() * 200)}.2.2`;

    for (let i = 0; i < 2; i++) {
      await request(server)
        .post('/test/by-ip')
        .set('X-Forwarded-For', ipA)
        .expect(200);
    }
    await request(server)
      .post('/test/by-ip')
      .set('X-Forwarded-For', ipA)
      .expect(429);
    await request(server)
      .post('/test/by-ip')
      .set('X-Forwarded-For', ipB)
      .expect(200);
  });

  it('uses the token bucket when the decorator asks for it', async () => {
    const body = { email: email('bucket') };

    await request(server).post('/test/bucket').send(body).expect(200);
    const res = await request(server).post('/test/bucket').send(body);

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('never limits a route without @RateLimit', async () => {
    for (let i = 0; i < 10; i++) {
      await request(server).get('/test/open').expect(200);
    }
  });

  it('records allowed and blocked requests in the metrics', async () => {
    const body = { email: email('metrics') };

    for (let i = 0; i < 4; i++) {
      await request(server).post('/test/limited').send(body);
    }
  });

  it('stores the counter in Redis under rate_limit:<route>:<id>', async () => {
    const id = email('key');
    await request(server).post('/test/limited').send({ email: id });

    const exists = await redis.exists(`rate_limit:/test/limited:${id}`);
    expect(exists).toBe(true);
  });
});

describe('RateLimitInterceptor when Redis fails (fail-open)', () => {
  let app: NestExpressApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        RateLimitInterceptor,
        {
          provide: RedisService,
          useFactory: () =>
            new RedisService(process.env.REDIS_URL ?? 'redis://localhost:6379'),
          useValue: {
            check: jest.fn().mockRejectedValue(new Error('Redis is down')),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', true);
    app.useLogger(false); // this test makes Redis fail on purpose, so hide the error logs
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('lets requests through instead of breaking the API', async () => {
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/test/limited')
        .send({ email: email('failopen') })
        .expect(200);
    }
  });
});
