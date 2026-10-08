import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Query filters for the current user's notification list. */
export class ListNotificationsQueryDto {
  /** `true` limits the list to unread notifications. */
  @IsOptional()
  @IsBooleanString()
  unread?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
