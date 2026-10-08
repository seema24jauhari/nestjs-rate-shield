import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { IpListService, ListName } from '../services/ip-list.service';
@Injectable()
export class BlacklistGuard implements CanActivate {
  private readonly logger = new Logger(BlacklistGuard.name);

  constructor(private ipListService: IpListService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    // Express can report IPv4 as "::ffff:1.2.3.4", so normalise it
    const ip = String(req.ip).replace('::ffff:', '');

    let blocked = false;
    try {
      blocked = await this.ipListService.isInList(ListName.Blacklist, ip);
    } catch (e) {
      // fail-open: if Redis is down, don't block everyone
      this.logger.error(`Blacklist check failed: ${(e as Error).message}`);
    }

    if (blocked) {
      throw new ForbiddenException('Your IP is blocked');
    }
    return true;
  }
}
