import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RoleName } from '@ohb/shared';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsEnum(RoleName)
  role: RoleName;

  /**
   * Required for REGIONAL_LAB_HEAD, forbidden for BUREAU_ADMIN.
   * Enforced in the service against the chosen role.
   */
  @IsOptional()
  @IsString()
  laboratoryId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @IsOptional()
  @IsString()
  laboratoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
