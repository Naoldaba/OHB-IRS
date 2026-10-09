import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Optional parent category id; omit/null for a top-level category. */
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Re-parent the category. `null` moves it to the top level; a string sets a
   * new parent. Absent leaves the parent unchanged. `ValidateIf` lets `null`
   * through while still type-checking a provided string.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  parentId?: string | null;
}
