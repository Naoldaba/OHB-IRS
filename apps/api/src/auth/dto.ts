import { IsBoolean, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  newPassword: string;
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName: string;
}

/** Self-service notification preferences. */
export class UpdateNotificationPreferenceDto {
  @IsBoolean()
  emailNotifications: boolean;
}

export class UpdatePresencePreferenceDto {
  @IsBoolean()
  showOnlineStatus: boolean;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  newPassword: string;
}

/** A second-factor code: a 6-digit TOTP or a recovery code. */
export class TwoFactorCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code: string;
}

/** Disabling 2FA requires the account password plus a current code. */
export class DisableTwoFactorDto {
  @IsString()
  @MinLength(1)
  password: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code: string;
}
