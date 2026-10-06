import { IsEmail, IsString } from 'class-validator';


export class VerifyOtpDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;

  @IsString()
  code: string;
}
