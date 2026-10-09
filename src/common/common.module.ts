import { Module } from '@nestjs/common';
import { IpListService } from './services/ip-list.service';

@Module({
  providers: [IpListService],
  exports: [IpListService],
})
export class CommonModule {}
