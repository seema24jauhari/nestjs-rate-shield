# nestjs-rate-shield

[![npm version](https://img.shields.io/npm/v/nestjs-rate-shield.svg)](https://www.npmjs.com/package/nestjs-rate-shield)
[![CI](https://github.com/<your-username>/<your-repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-username>/<your-repo>/actions)
[![license](https://img.shields.io/npm/l/nestjs-rate-shield.svg)](LICENSE)

Redis-backed rate limiting for NestJS. Limit any route with one decorator, choose **sliding window** or **token bucket** per route, and block or trust IP addresses with a blacklist and whitelist.

```ts
@Post('login')
@RateLimit({ limit: 5, window: 900, keyBy: 'email' })   // 5 attempts per 15 minutes, per email
login(@Body() dto: LoginDto) { ... }
```

## Features

- **`@RateLimit()` decorator:** set the limit, window, caller key and algorithm per route.
- **Two algorithms:** sliding window (strict counts) and token bucket (bursts with a steady refill).
- **Atomic counting:** each check runs as a single Lua script in Redis, so there are no race conditions under concurrent traffic, even across several app instances.
- **Standard headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and an exact `Retry-After` on `429`.
- **Blacklist and whitelist:** block abusive IPs with `403`, and let trusted IPs skip limiting.
- **Fail-open:** if Redis is unreachable, requests are allowed and the error is logged, so the limiter never takes your API down.

## Requirements

- Node.js 22 and NestJS 11 (the versions this package is tested with)
- A running Redis server
- The Express platform (`@nestjs/platform-express`)

## Installation

```bash
npm install nestjs-rate-shield
```

## Quick start

### 1. Register the modules

```ts
import { Module } from '@nestjs/common';
import { RedisModule, CommonModule } from 'nestjs-rate-shield';

@Module({
  imports: [
    RedisModule.forRoot({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    }),
    CommonModule,
  ],
})
export class AppModule {}
```

Your application supplies the Redis settings. Keep credentials in environment variables.

### 2. Limit a route

```ts
import { Controller, Post, UseInterceptors } from '@nestjs/common';
import { RateLimit, RateLimitInterceptor } from 'nestjs-rate-shield';

@Controller('auth')
@UseInterceptors(RateLimitInterceptor)
export class AuthController {
  @Post('register')
  @RateLimit({ limit: 3, window: 3600, keyBy: 'ip' })   // 3 sign-ups per hour, per IP
  register() { ... }
}
```

The interceptor does nothing on routes that have no `@RateLimit()`. To apply it to the whole app, register it with `APP_INTERCEPTOR` instead of using `@UseInterceptors` on each controller.

## `@RateLimit()` options

| Option | Default | Description |
|---|---|---|
| `limit` | `100` | Maximum requests per window (sliding window), or the bucket size (token bucket) |
| `window` | `60` | Window length in seconds (sliding window), or the seconds it takes to refill a full bucket (token bucket) |
| `keyBy` | `'ip'` | Who is counted: `'ip'`, `'email'` or `'phone'` |
| `algorithm` | `'sliding-window'` | `'sliding-window'` or `'token-bucket'` |

Put the decorator on the **route method**. It is not read from the controller class.

## Algorithms

### Sliding window

Counts the requests made in the last `window` seconds. Once `limit` requests are inside that period, further requests are blocked until the oldest one leaves the window. Use it when you need a strict count and don't want the burst a fixed window allows at its edges (for example login, sign-up and password reset).

```ts
@RateLimit({ limit: 5, window: 900, keyBy: 'email', algorithm: 'sliding-window' })
```

### Token bucket

Each caller has a bucket that holds up to `limit` tokens. Every request uses one token, and tokens refill continuously at `limit / window` per second. A caller can send a short burst, then is held to a steady rate. Use it for spacing rules such as OTP resends.

```ts
// A bucket of 1 token that refills in 30 seconds: one send every 30 seconds
@RateLimit({ limit: 1, window: 30, keyBy: 'email', algorithm: 'token-bucket' })
```

Another example: `limit: 20, window: 60` gives a bucket of 20 tokens that refills about 1 token every 3 seconds.

## How callers are identified

- The counter key is `rate_limit:<route path>:<caller>`, so each route has its **own** counter for each caller.
- `keyBy: 'ip'` uses `req.ip`.
- `keyBy: 'email'` and `'phone'` read `req.body.email` and `req.body.phone`.
- If that body field is missing, the caller falls back to the IP.
- Values are lowercased, so `User@Mail.com` and `user@mail.com` share one counter.

## Responses and headers

Allowed responses include:

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | The limit set on the route |
| `X-RateLimit-Remaining` | Requests (or tokens) left |
| `X-RateLimit-Reset` | Unix time (seconds) when a slot frees up, or when the bucket is full again |

A blocked request gets HTTP `429` with a `Retry-After` header (seconds to wait) and this body:

```json
{
  "statusCode": 429,
  "message": "Too many requests",
  "retryAfter": 12
}
```

If your frontend runs on another origin, expose these headers in CORS so browser code can read them:

```ts
app.enableCors({
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
});
```

## Blacklist and whitelist

- **Blacklist:** `BlacklistGuard` returns `403 Forbidden` for blacklisted IPs on every route it covers. A blacklisted IP is blocked even if it is also whitelisted.
- **Whitelist:** whitelisted IPs skip rate limiting.

Register the guard globally:

```ts
import { APP_GUARD } from '@nestjs/core';
import { BlacklistGuard, CommonModule } from 'nestjs-rate-shield';

@Module({
  imports: [CommonModule],
  providers: [{ provide: APP_GUARD, useClass: BlacklistGuard }],
})
export class AppModule {}
```

Manage the lists with `IpListService`:

```ts
import { Injectable } from '@nestjs/common';
import { IpListService, ListName } from 'nestjs-rate-shield';

@Injectable()
export class IpManagementService {
  constructor(private readonly ipList: IpListService) {}

  blockIp(ip: string)  { return this.ipList.add(ListName.Blacklist, ip); }
  trustIp(ip: string)  { return this.ipList.add(ListName.Whitelist, ip); }
  unblockIp(ip: string) { return this.ipList.remove(ListName.Blacklist, ip); }
}
```

> **Security:** the package does not ship admin routes. If you expose these methods over HTTP, protect them with your own authentication, or anyone could whitelist themselves.

## Behind a proxy or load balancer

Behind Nginx, a cloud load balancer or Cloudflare, your app sees the proxy's address unless Express is told to trust it, and then every user shares one limit. Set this in `main.ts`:

```ts
app.set('trust proxy', 1);   // trust exactly one proxy in front of the app
```

Use the real number of proxies. `true` trusts the whole `X-Forwarded-For` header, which any client can fake to avoid IP limits.

Users behind the same office or school network share one public IP. For routes where the user is known, prefer `keyBy: 'email'` or `'phone'` over `'ip'`.

## Reliability

- **Redis unreachable:** the request is allowed, the error is logged, and the rate-limit headers are skipped for that response. The limiter fails open on purpose, so a Redis outage doesn't become an API outage.
- **Several app instances:** all of them share the same counters through Redis.
- **Cleanup:** every key expires on its own after a quiet period, so Redis doesn't fill up.

## Suggested limits

| Route | `limit` / `window` | `keyBy` | `algorithm` |
|---|---|---|---|
| Sign-up | 3 / 3600 | `ip` | sliding-window |
| Login | 5 / 900 | `email` | sliding-window |
| Forgot password | 3 / 3600 | `email` | sliding-window |
| Send OTP | 1 / 30 | `email` or `phone` | token-bucket |
| Verify OTP | 5 / 900 | `email` or `phone` | sliding-window |

## Limitations

- One rule per route.
- The decorator works on route methods, not on controller classes.
- Express only (not Fastify).

## Exports

`RedisModule`, `RedisService`, `CommonModule`, `RateLimit`, `RateLimitInterceptor`, `IpListService`, `ListName`, `BlacklistGuard`

## Development and testing

```bash
npm install
npm run build     # compiles to dist/ and copies the Lua scripts
npm test          # needs a Redis server on localhost:6379
```

The tests run against a real Redis, because the Lua scripts can't be tested with mocks. They cover both algorithms, concurrent requests (for example 20 parallel calls with a limit of 5 allow exactly 5), the response headers, and the fail-open behavior.

## License

MIT