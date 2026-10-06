import { Controller, Get, Res } from '@nestjs/common';

@Controller('mertics')
export class MerticsController {
    @Get()
    async metrics(@Res() res: Response) {
        // res.set('Content-Type', register.contentType);
        // res.send(await register.metrics());
    }
}
