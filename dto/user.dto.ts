import { Type } from 'class-transformer';
import { IsEmail, IsString, MinLength, IsOptional, IsEnum, MaxLength, Matches, ArrayMaxSize, ValidateNested, IsArray, IsNumber, IsBoolean } from 'class-validator';
import { UserRole } from 'entities/global.entity';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(['Business', 'Individual'])
  type: 'Business' | 'Individual';

  @IsOptional()
  @IsString()
  ref?: string;

  @IsEnum(UserRole)
  role: UserRole;
}
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  code: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  email: string;

  @IsString()
  otp: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(20, { message: 'Password must be at most 20 characters' })
  @Matches(/^[A-Za-z0-9_@$!%*?&]+$/, {
    message: 'Password can only contain letters, numbers, and special characters _ @ $ ! % * ? &.',
  })
  newPassword: string;
}

export class OAuthCallbackDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  error?: string;
}