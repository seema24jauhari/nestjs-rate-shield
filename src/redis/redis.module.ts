import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [
    {
      provide: RedisService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl =
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        return new RedisService(redisUrl);
      },
    },
  ],
  exports: [RedisService], // lets other modules use it
})
export class RedisModule {}
