/**
 * Response shapes returned by the API. Structural types (field schema, render
 * model, enums) are imported from @ohb/shared so the web app and API agree on
 * one definition; these interfaces describe the JSON the API controllers emit.
 */

import type {
  FeedbackType,
  FieldSchema,
  PeriodType,
  RenderModel,
  ReportDefinitionStatus,
  ReportStatus,
  RoleName,
} from '@ohb/shared';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleName;
  laboratoryId: string | null;
}

export interface Laboratory {
  id: string;
  code: string;
  name: string;
  zone?: string | null;
  town?: string | null;
  isActive: boolean;
}

export interface ReportCategory {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

export interface ReportType {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  description?: string | null;
  defaultFrequency: PeriodType;
  isActive: boolean;
  category?: ReportCategory;
}

export interface DefinitionVersionSummary {
  id: string;
  reportTypeId: string;
  version: number;
  status: ReportDefinitionStatus;
  schemaSource: string;
  createdAt: string;
  publishedAt?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  publishedBy?: { id: string; fullName: string } | null;
  _count?: { submissions: number; rules: number };
}

export interface DefinitionVersion extends DefinitionVersionSummary {
  fieldSchema: FieldSchema | Record<string, never>;
}

export interface ReportingPeriod {
  id: string;
  reportTypeId: string;
  periodType: PeriodType;
  year: number;
  periodNumber: number;
  label: string;
  startDate: string;
  endDate: string;
  dueDate: string;
}

export interface SubmissionSummary {
  id: string;
  status: ReportStatus;
  reportTypeId: string;
  laboratoryId: string;
  reportingPeriodId: string;
  definitionVersionId: string | null;
  currentVersion: number;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  updatedAt: string;
  reportType?: { id: string; name: string; code: string };
  laboratory?: { id: string; name: string; code: string };
  reportingPeriod?: {
    id: string;
    label: string;
    year: number;
    periodNumber: number;
    dueDate: string;
  };
  definitionVersion?: { id: string; version: number };
}

export interface Feedback {
  id: string;
  submissionId: string;
  type: FeedbackType;
  message: string;
  sectionKey?: string | null;
  fieldKey?: string | null;
  createdAt: string;
  author?: { id: string; fullName: string };
}

export interface SubmissionDetail extends SubmissionSummary {
  data: Record<string, unknown>;
  schema: FieldSchema | null;
  renderModel: RenderModel | null;
  feedback: Feedback[];
}

export interface SaveDraftResponse {
  submission: SubmissionSummary;
  validation: { ok: boolean; errors: { path: string; message: string }[] };
}
