import { DynamicModule, Module } from '@nestjs/common';
import { RedisService, RedisOptions } from './redis.service';

@Module({})
export class RedisModule {
  static forRoot(options: RedisOptions): DynamicModule {
    return {
      global: true,
      module: RedisModule,
      providers: [
        {
          provide: RedisService,
          useFactory: () => new RedisService(options),
        },
      ],
      exports: [RedisService],
    };
  }
}
