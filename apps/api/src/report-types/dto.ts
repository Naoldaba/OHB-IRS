import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PeriodType } from '@ohb/shared';

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

export class CreateReportTypeDto {
  @IsString()
  categoryId: string;

  @IsString()
  @MaxLength(80)
  @Matches(CODE_PATTERN, {
    message: 'code must be lower_snake_case starting with a letter',
  })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(PeriodType)
  defaultFrequency: PeriodType;
}

export class UpdateReportTypeDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(PeriodType)
  defaultFrequency?: PeriodType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
