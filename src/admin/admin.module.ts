import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { RedisModule } from 'src/redis/redis.module';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [AdminService],
  imports: [RedisModule],
})
export class AdminModule {}
