import {
  IsBooleanString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FeedbackType, ReportStatus } from '@ohb/shared';

export class CreateSubmissionDto {
  @IsString()
  reportTypeId: string;

  @IsString()
  reportingPeriodId: string;
}

export class UpdateSubmissionDataDto {
  /** The full report data object, shaped to the report's field schema. */
  @IsObject()
  data: Record<string, unknown>;
}

export class RequestRevisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  sectionKey?: string;

  @IsOptional()
  @IsString()
  fieldKey?: string;
}

export class AddFeedbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsEnum(FeedbackType)
  type?: FeedbackType;

  @IsOptional()
  @IsString()
  sectionKey?: string;

  @IsOptional()
  @IsString()
  fieldKey?: string;

  /** When set, this feedback is a reply in the thread rooted at `parentId`. */
  @IsOptional()
  @IsString()
  parentId?: string;
}

/** Optional query filters for the admin submission list. */
export class ListSubmissionsQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsString()
  laboratoryId?: string;

  @IsOptional()
  @IsString()
  reportTypeId?: string;

  /** `true` limits the list to submissions carrying rule FLAG outcomes. */
  @IsOptional()
  @IsBooleanString()
  flagged?: string;
}
