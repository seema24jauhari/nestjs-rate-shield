import { Controller, Get, Res } from '@nestjs/common';
import { register } from 'prom-client';
import type { Response } from 'express';

@Controller('metrics')
export class MetricsController {
    @Get()
    async metrics(@Res() res: Response) {
        res.set('Content-Type', register.contentType);
        res.send(await register.metrics());
    }
}
 
