import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FeedbackType, ReportStatus } from '@ohb/shared';
import { EXPORT_FORMATS, type ExportFormat } from '../export/export.service';

export class CreateSubmissionDto {
  @IsString()
  reportTypeId: string;

  @IsString()
  reportingPeriodId: string;

  /**
   * Optional: seed the new draft's data from a previous submission's data
   * (same report type, same laboratory). The server re-shapes the copied data
   * to the new period's pinned definition version — fields absent from the
   * current version are dropped; it never invents fields. See Phase 16.
   */
  @IsOptional()
  @IsString()
  copyFromSubmissionId?: string;
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

/**
 * Body for `POST /submissions/:id/review/approve` (Phase 27). Approving a report
 * records an accountable digital sign-off. The reviewer re-affirms the approval
 * by typing their own full name (validated server-side against the signed-in
 * user), with an optional note. No cryptographic signature — a typed-name
 * affirmation only, per the plan.
 */
export class ApproveSubmissionDto {
  /** Typed full-name affirmation; must match the signed-in reviewer's name. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  confirmName: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
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

  /**
   * User ids @mentioned in this message. The server keeps only those authorized
   * to see the submission and notifies them; unauthorized ids are ignored
   * (never persisted, never notified). See Phase 24.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  mentions?: string[];
}

/** Body for `POST /submissions/:id/feedback/:feedbackId/resolve`. */
export class ResolveFeedbackDto {
  /** true resolves the thread; false reopens it. */
  @IsBoolean()
  resolved: boolean;
}

/** Body for `POST /submissions/:id/attachments` (multipart; the file rides alongside). */
export class UploadAttachmentDto {
  /** Optional report section the attachment supports (anchors it in the UI). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sectionKey?: string;
}

/** Whitelisted sort orders for the submission list. */
export const SUBMISSION_SORTS = ['updated', 'period'] as const;
export type SubmissionSort = (typeof SUBMISSION_SORTS)[number];

/** Optional query filters for the submission list (lab- or admin-scoped). */
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

  /**
   * Sort order. `updated` (default) is most-recently-updated first; `period`
   * is newest reporting period first (year, then period number).
   */
  @IsOptional()
  @IsIn(SUBMISSION_SORTS)
  sort?: SubmissionSort;
}

/** Query for `GET /submissions/:id/export`. */
export class ExportSubmissionQueryDto {
  @IsIn(EXPORT_FORMATS)
  format: ExportFormat;

  /** Export an immutable historical version snapshot instead of current data. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
