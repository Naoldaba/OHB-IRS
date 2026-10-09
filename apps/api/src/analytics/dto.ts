import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query filters for the Bureau analytics dashboard. */
export class DashboardQueryDto {
  /** Scope every metric to a single report type. */
  @IsOptional()
  @IsString()
  reportTypeId?: string;

  /** How many of the most recent opened periods the trend series returns. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  trendLimit?: number;
}

/** Dashboard query plus the export file format (Phase 19). */
export class DashboardExportQueryDto extends DashboardQueryDto {
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';
}

/** Query for the review-SLA endpoint (Phase 21). */
export class ReviewSlaQueryDto {
  /** How many of the longest-waiting submissions to return (1–50, default 10). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  oldestLimit?: number;
}
