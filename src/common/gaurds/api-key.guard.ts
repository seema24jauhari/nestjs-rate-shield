import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const sent = Buffer.from(String(req.headers['x-api-key'] ?? ''));
    const expected = Buffer.from(this.config.getOrThrow<string>('ADMIN_API_KEY'));

    // timingSafeEqual needs equal lengths, so check length first
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}