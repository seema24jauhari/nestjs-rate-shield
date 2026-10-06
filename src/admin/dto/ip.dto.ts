import { IsIP } from 'class-validator';
 
export class IpDto {
  @IsIP(undefined, { message: 'Enter a valid IP address' })
  ip: string;
}