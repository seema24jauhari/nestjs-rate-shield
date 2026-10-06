import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;
}
