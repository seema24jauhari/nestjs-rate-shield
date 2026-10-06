import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { MailService } from 'src/mail/mail.service';
import { RedisService } from 'src/redis/redis.service';


@Injectable()
export class OtpService {
    constructor(private readonly redis: RedisService, private readonly mailService: MailService) {}

    private hash(code: string) {
         return crypto.createHash('sha256').update(code).digest('hex');
    }

    
    async sendOtp(email: string) {
        const code = crypto.randomInt(100000, 1000000).toString();   // 6 digits
        const key = `otp:${email.toLowerCase()}`;

        // save the HASH for 5 minutes (300 seconds)
        await this.redis.set(key, this.hash(code), 3600);

        await this.mailService.sendOtpEmail(email, code);
        return { message: 'If the email is valid, an OTP has been sent' };
    }

    async verifyOtp(email: string, code: string) {
        const key = `otp:${email.toLowerCase()}`;
        const saved = await this.redis.get(key);

        if (!saved || saved !== this.hash(code)) {
            throw new BadRequestException('Invalid or expired code');
        }

        await this.redis.del(key);   // one use only
        return { message: 'Verified' };
    }
}
