import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Query for `GET /search`. */
export class SearchQueryDto {
  /** The search text. Short/blank queries return an empty result set. */
  @IsString()
  @MaxLength(200)
  q: string;

  /** Max hits per group (report types / submissions / feedback). Capped server-side. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}
