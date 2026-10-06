import { Module } from '@nestjs/common';
import { OtpController } from './otp.controller';
import { MailModule } from 'src/mail/mail.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { RedisModule } from 'src/redis/redis.module';
import { OtpService } from './otp.service';

@Module({
  controllers: [OtpController],
  imports: [
    MailModule,
    RedisModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [OtpService],
})
export class OtpModule {}
