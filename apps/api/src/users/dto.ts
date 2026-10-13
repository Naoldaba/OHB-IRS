import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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

  /** A role name (system or custom). The service resolves it and its scope. */
  @IsString()
  role: string;

  /**
   * Required for a LAB-scoped role, forbidden for a BUREAU-scoped role.
   * Enforced in the service against the chosen role's scope.
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
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  laboratoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
