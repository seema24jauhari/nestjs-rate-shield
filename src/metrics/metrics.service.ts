import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly allowed = new Counter({
    name: 'rate_limit_allowed_total',
    help: 'Requests allowed by the rate limiter',
    labelNames: ['endpoint'],
  });

  readonly blocked = new Counter({
    name: 'rate_limit_blocked_total',
    help: 'Requests blocked by the rate limiter',
    labelNames: ['endpoint'],
  });

  constructor() {
    collectDefaultMetrics(); // CPU, memory, event loop, etc.
  }
}
