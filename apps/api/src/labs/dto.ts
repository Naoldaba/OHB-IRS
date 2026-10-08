import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
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
}
