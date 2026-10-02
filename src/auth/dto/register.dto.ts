import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'Name is required' }) // custom msg
  name: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please enter a valid email' })
  email: string;

  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#])[A-Za-z\d@$!%*?&_#]{8,}$/,
    {
      message:
        'Password must be at least 8 characters and contain 1 uppercase, 1 lowercase, 1 number, and 1 special character',
    },
  )
  @MinLength(6, { message: 'Password must have alteast 6 digits' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: string;
}
