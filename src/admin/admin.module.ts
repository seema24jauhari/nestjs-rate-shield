import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { RedisModule } from '../redis/redis.module';
import { AdminController } from './admin.controller';
import { CommonModule } from 'src/common/common.module';

@Module({
  controllers: [AdminController],
  providers: [AdminService],
  imports: [RedisModule, CommonModule],
  exports: [AdminService],
})
export class AdminModule {}
