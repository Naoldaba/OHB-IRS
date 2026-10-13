import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RoleScope } from '@ohb/shared';

/** Body for `PATCH /roles/assignments/:userId`. */
export class AssignRoleDto {
  /** Target role name (system or custom). The service derives the lab contract. */
  @IsString()
  role: string;

  /**
   * Target laboratory. Required when the target role is LAB-scoped; must be
   * absent when BUREAU-scoped (the service enforces the contract). `null`/omitted
   * clears it.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  laboratoryId?: string | null;
}

/**
 * Body for `PATCH /roles/:name/permissions`. The full desired set of capability
 * keys for the role (the service replaces the role's grants with these). Each
 * key is validated against the code-backed whitelist server-side.
 */
export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  capabilityKeys: string[];
}

/** Body for `POST /roles` — create a custom role. */
export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsEnum(RoleScope)
  scope: RoleScope;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Optional starting capabilities (validated against the whitelist server-side). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  capabilityKeys?: string[];
}

/**
 * Body for `PATCH /roles/:name` — edit a custom role's label/description/active
 * state. Scope and system roles' identity are immutable (enforced in the service).
 */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
