import { Type } from 'class-transformer';
import { IsEmail, IsString, MinLength, IsOptional, IsEnum, MaxLength, Matches, ArrayMaxSize, ValidateNested, IsArray, IsNumber, IsBoolean, ArrayUnique } from 'class-validator';
import { UserRole } from 'entities/global.entity';
import { Permissions } from 'entities/permissions';

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

export class DeactivateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason?: string;
}


export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long' })
  newPassword: string;
}

export class UpdateUserPermissionsDto {
  @IsOptional() @IsNumber() users?: number;
  @IsOptional() @IsNumber() categories?: number;
  @IsOptional() @IsNumber() services?: number;
  @IsOptional() @IsNumber() jobs?: number;
  @IsOptional() @IsNumber() orders?: number;
  @IsOptional() @IsNumber() invoices?: number;
  @IsOptional() @IsNumber() disputes?: number;
  @IsOptional() @IsNumber() finance?: number;
  @IsOptional() @IsNumber() settings?: number;
  @IsOptional() @IsNumber() statistics?: number;
}

class CountryCodeDto {
  @IsString()
  code: string;

  @IsString()
  dial_code: string;
}

export class PhoneRegisterDto {
  @IsString()
  phone: string;

  @ValidateNested()
  @Type(() => CountryCodeDto)
  countryCode: CountryCodeDto;

  @IsOptional()
  @IsEnum(['Business', 'Individual'])
  type?: 'Business' | 'Individual';

  @IsOptional()
  @IsString()
  ref?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}


export class PhoneVerifyDto {
  @IsString()
  phone: string;

  @ValidateNested()
  @Type(() => CountryCodeDto)
  countryCode: CountryCodeDto;

  @IsString()
  code: string;
}
