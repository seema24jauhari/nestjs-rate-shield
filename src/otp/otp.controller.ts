import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { SendOtpDto } from './dto/sentOtp.dto';
import { OtpService } from './otp.service';
import { VerifyOtpDto } from './dto/verifyOtp.dto';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';

@Controller('otp')
@UseInterceptors(RateLimitInterceptor)
export class OtpController {
  constructor(private readonly optService: OtpService) {}

  @Post('otp/send')
  @RateLimit({
    limit: 1,
    window: 3600,
    keyBy: 'email',
    algorithm: 'token-bucket',
  })
  @HttpCode(200)
  sendOtp(@Body() otpDto: SendOtpDto) {
    return this.optService.sendOtp(otpDto.email);
  }

  @Post('otp/verify')
  @RateLimit({ limit: 3, window: 60, keyBy: 'email' })
  @HttpCode(200)
  verifyOtp(@Body() otpDto: VerifyOtpDto) {
    return this.optService.verifyOtp(otpDto.email, otpDto.code);
  }
}
