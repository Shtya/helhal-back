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
  @IsOptional() @IsEnum(Permissions.Categories, { each: true }) @ArrayUnique() users?: Permissions.Users[];
  @IsOptional() @IsEnum(Permissions.Categories, { each: true }) @ArrayUnique() categories?: Permissions.Categories[];
  @IsOptional() @IsEnum(Permissions.Services, { each: true }) @ArrayUnique() services?: Permissions.Services[];
  @IsOptional() @IsEnum(Permissions.Jobs, { each: true }) @ArrayUnique() jobs?: Permissions.Jobs[];
  @IsOptional() @IsEnum(Permissions.Orders, { each: true }) @ArrayUnique() orders?: Permissions.Orders[];
  @IsOptional() @IsEnum(Permissions.Invoices, { each: true }) @ArrayUnique() invoices?: Permissions.Invoices[];
  @IsOptional() @IsEnum(Permissions.Disputes, { each: true }) @ArrayUnique() disputes?: Permissions.Disputes[];
  @IsOptional() @IsEnum(Permissions.Finance, { each: true }) @ArrayUnique() finance?: Permissions.Finance[];
  @IsOptional() @IsEnum(Permissions.Settings, { each: true }) @ArrayUnique() settings?: Permissions.Settings[];
  @IsOptional() @IsEnum(Permissions.Statistics, { each: true }) @ArrayUnique() statistics?: Permissions.Statistics[];
}