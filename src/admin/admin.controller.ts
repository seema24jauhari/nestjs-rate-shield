import { Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { IpDto } from './dto/ip.dto';
import { AdminService, ListName } from './admin.service';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { ApiKeyGuard } from 'src/common/gaurds/api-key.guard';
import { ApiSecurity } from '@nestjs/swagger';

@Controller('admin')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
@UseInterceptors(RateLimitInterceptor)     
export class AdminController {
    constructor(private readonly adminService: AdminService) {}
    
    @Get('stats')
    @RateLimit({ limit: 30, window: 60, keyBy: 'ip' })    
    stats() {
        return this.adminService.stats();
    }
    
    @Post(':list')
    @RateLimit({ limit: 30, window: 60, keyBy: 'ip' })    
    @HttpCode(200)
    list(@Param('list', new ParseEnumPipe(ListName)) list: ListName, @Body() dto: IpDto) {
       return this.adminService.add(list, dto.ip);
    }

    @Get(':list')
    @RateLimit({ limit: 30, window: 60, keyBy: 'ip' })    
    @HttpCode(200)
    getAll(@Param('list', new ParseEnumPipe(ListName)) list: ListName) {
        return this.adminService.getAll(list);
    }

    @Delete(':list/:ip')
    @RateLimit({ limit: 30, window: 60, keyBy: 'ip' })    
    remove(
        @Param('list', new ParseEnumPipe(ListName)) list: ListName,
        @Param('ip') ip: string,
    ) {
        return this.adminService.remove(list, ip);
    }

    
}
