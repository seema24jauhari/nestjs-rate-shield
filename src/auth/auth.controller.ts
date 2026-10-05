import { Body, Controller, HttpCode, Post, Req, Res, UseInterceptors } from '@nestjs/common';
import { RateLimit } from 'src/decorators/rate-limit.decorator';
import { RateLimitInterceptor } from 'src/interceptors/rate-limit.interceptor';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import * as express from 'express';

@Controller('auth')
@UseInterceptors(RateLimitInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(200)
  @RateLimit({ limit: 3, window: 3600, keyBy: 'email' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit({ limit: 3, window: 3, keyBy: 'email' })
  login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
    @Req() req: express.Request,
  ) {
    return this.authService.login(loginDto.email, loginDto.password, res, req);
  }
}
