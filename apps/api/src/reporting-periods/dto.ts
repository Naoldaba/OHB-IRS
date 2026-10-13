import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PeriodType } from '@ohb/shared';

export class CreateReportingPeriodDto {
  @IsString()
  reportTypeId: string;

  @IsEnum(PeriodType)
  periodType: PeriodType;

  /** Ethiopian year. */
  @IsInt()
  @Min(1900)
  @Max(2200)
  year: number;

  /** Ethiopian month 1-13 (MONTHLY), quarter 1-4 (QUARTERLY), or 1 (YEARLY). */
  @IsInt()
  @Min(1)
  @Max(13)
  periodNumber: number;

  /** Optional override of the display label (defaulted from the calendar). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  /**
   * Optional submission due date (ISO 8601, canonical Gregorian/UTC). Defaults
   * to the first day after the period ends when omitted.
   */
  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

/**
 * Update a reporting period. `label` and `dueDate` can always be changed; the
 * calendar identity (`periodType`/`year`/`periodNumber`, which drives the date
 * ranges) can only change while the period has no submissions.
 */
export class UpdateReportingPeriodDto {
  @IsOptional()
  @IsEnum(PeriodType)
  periodType?: PeriodType;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(13)
  periodNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}
