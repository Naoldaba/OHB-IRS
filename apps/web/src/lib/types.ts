/**
 * Response shapes returned by the API. Structural types (field schema, render
 * model, enums) are imported from @ohb/shared so the web app and API agree on
 * one definition; these interfaces describe the JSON the API controllers emit.
 */

import type {
  Diagnostic,
  FeedbackType,
  FieldSchema,
  NotificationType,
  PeriodType,
  RenderModel,
  ReportDefinitionStatus,
  ReportStatus,
  RoleName,
} from '@ohb/shared';

/** A FLAG-severity rule outcome snapshotted on a submission at submit time. */
export type SubmissionFlag = Diagnostic;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleName;
  laboratoryId: string | null;
  /** Public URL of the user's profile picture, or null when none is set. */
  avatarUrl: string | null;
  /** When true, the user must change their password before anything else. */
  mustChangePassword: boolean;
}

export interface Laboratory {
  id: string;
  code: string;
  name: string;
  zone?: string | null;
  town?: string | null;
  isActive: boolean;
  /** Present on the admin list endpoint. */
  _count?: { users: number };
}

/** A user as returned by the admin `/users` endpoints (never the password hash). */
export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  role: { id: string; name: RoleName };
  laboratory?: { id: string; name: string; code: string } | null;
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
  flags?: SubmissionFlag[] | null;
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
  parentId?: string | null;
  createdAt: string;
  author?: { id: string; fullName: string };
  /** Replies, present on thread roots returned by the API. */
  replies?: Feedback[];
}

/** An immutable snapshot written on each submit / resubmit. */
export interface SubmissionVersionRow {
  id: string;
  submissionId: string;
  versionNumber: number;
  status: ReportStatus;
  data: Record<string, unknown>;
  submittedAt: string;
  submittedBy?: { id: string; fullName: string };
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

// ---- Analytics (Phase 8) ----------------------------------------------------

/** Compliance tallies over a set of expected submission slots. */
export interface ComplianceCounts {
  expected: number;
  submitted: number;
  pendingReview: number;
  approved: number;
  revisionRequired: number;
  overdue: number;
  pending: number;
  draft: number;
  /** submitted / expected, 0..1 (0 when nothing is expected). */
  complianceRate: number;
}

export interface OverviewAnalytics extends ComplianceCounts {
  totalLaboratories: number;
  totalReportTypes: number;
  flagged: number;
}

export interface LabComplianceRow extends ComplianceCounts {
  laboratoryId: string;
  laboratoryName: string;
  laboratoryCode: string;
}

export interface TrendPoint extends ComplianceCounts {
  periodId: string;
  periodLabel: string;
  year: number;
  periodNumber: number;
  reportTypeId: string;
  reportTypeName: string;
  dueDate: string;
}

export interface DashboardAnalytics {
  generatedAt: string;
  overview: OverviewAnalytics;
  laboratories: LabComplianceRow[];
  trends: TrendPoint[];
}

// ---- Notifications (Phase 9) ------------------------------------------------

/** An in-app notification addressed to the current user. */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  submissionId: string | null;
  readAt: string | null;
  createdAt: string;
  actor?: { id: string; fullName: string } | null;
}

/** A persisted business rule, as returned by the rules API (jsonb AST included). */
export interface BusinessRuleRow {
  id: string;
  definitionVersionId: string;
  key: string;
  name: string;
  description?: string | null;
  kind: string;
  severity?: string | null;
  condition?: Record<string, unknown> | null;
  action: Record<string, unknown>;
  enabled: boolean;
  order: number;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
}
