import { Module } from '@nestjs/common';
import { IpListService } from './services/ip-list.service';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  providers: [IpListService],
  exports: [IpListService],
  imports: [RedisModule],
})
export class CommonModule {}
