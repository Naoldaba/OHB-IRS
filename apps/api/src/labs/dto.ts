import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Uppercase/underscore code, derived from the name when omitted. */
const CODE_PATTERN = /^[A-Z0-9_]+$/;

export class CreateLabDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(CODE_PATTERN, {
    message: 'code must contain only uppercase letters, numbers and underscores',
  })
  code?: string;

  // Geographic position for the compliance map (Phase 21). Optional; null clears
  // it. Validated as a WGS84 coordinate range only when a non-null value is given.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}

export class UpdateLabDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(CODE_PATTERN, {
    message: 'code must contain only uppercase letters, numbers and underscores',
  })
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}
