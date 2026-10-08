import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export enum ListName {
  Whitelist = 'whitelist',
  Blacklist = 'blacklist',
}

@Injectable()
export class IpListService {
  constructor(private readonly redis: RedisService) {}

  private key(list: ListName) {
    return `rate_limit:${list}`; // Redis Set
  }

  async add(list: ListName, ip: string) {
    await this.redis.sadd(this.key(list), ip);
    return { message: `${ip} added to ${list}` };
  }

  async getAll(list: ListName) {
    return { list, ips: await this.redis.smembers(this.key(list)) };
  }

  async remove(list: ListName, ip: string) {
    const removed = await this.redis.srem(this.key(list), ip);
    return {
      message: removed
        ? `${ip} removed from ${list}`
        : `${ip} was not in ${list}`,
    };
  }

  async isInList(list: ListName, ip: string): Promise<boolean> {
    return (await this.redis.sismember(this.key(list), ip)) === 1;
  }
}
