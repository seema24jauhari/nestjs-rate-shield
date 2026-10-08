import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminService {
  constructor(private readonly redis: RedisService) {}

  async stats() {
    const [allowed, blocked] = await this.redis.mget(
      'stats:allowed',
      'stats:blocked',
    );
    return { allowed: Number(allowed ?? 0), blocked: Number(blocked ?? 0) };
  }
}
