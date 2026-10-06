import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService, ListName } from 'src/admin/admin.service';

@Injectable()
export class BlacklistGuard implements CanActivate {
  constructor(private config: ConfigService, private adminService: AdminService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (await this.adminService.isInList(ListName.Blacklist, req.ip)) {
      throw new ForbiddenException('Your IP is blocked');
    }
    return true;
  }
}