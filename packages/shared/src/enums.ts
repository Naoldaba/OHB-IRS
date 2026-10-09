/**
 * System-wide enums shared between the API and the web app.
 * Role and ReportStatus values are also persisted in the database; keep the
 * string values stable.
 */

export enum RoleName {
  BUREAU_ADMIN = 'BUREAU_ADMIN',
  REGIONAL_LAB_HEAD = 'REGIONAL_LAB_HEAD',
}

/**
 * Report lifecycle as defined in CLAUDE.md. Do not add states without a
 * feature that requires them.
 *
 * DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED
 * UNDER_REVIEW -> REVISION_REQUIRED -> RESUBMITTED -> UNDER_REVIEW
 */
export enum ReportStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  RESUBMITTED = 'RESUBMITTED',
  APPROVED = 'APPROVED',
}

export enum FeedbackType {
  COMMENT = 'COMMENT',
  REVISION_REQUEST = 'REVISION_REQUEST',
}

/** Reporting frequency. Drives how reporting periods are generated. */
export enum PeriodType {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

/**
 * Lifecycle of a report-definition version. Published versions are immutable so
 * historical submissions stay interpretable. (See IMPLEMENTATION_PLAN §6.)
 */
export enum ReportDefinitionStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

/** Where a definition version's field structure comes from. */
export enum SchemaSource {
  REGISTRY = 'REGISTRY', // snapshot of a code registry definition (e.g. HIV Viral Load)
  CONFIGURED = 'CONFIGURED', // admin-authored structure (future)
}

/** Kinds of configurable business rule (see IMPLEMENTATION_PLAN §6.3). */
export enum BusinessRuleKind {
  VALIDATION = 'VALIDATION',
  CROSS_FIELD = 'CROSS_FIELD',
  CONDITIONAL = 'CONDITIONAL',
  CALCULATION = 'CALCULATION',
}

/** Severity for VALIDATION / CROSS_FIELD rules. ERROR blocks submission. */
export enum RuleSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  FLAG = 'FLAG',
  INFO = 'INFO',
}

/** Scope of a reusable rule template. */
export enum RuleTemplateScope {
  GLOBAL = 'GLOBAL',
  CATEGORY = 'CATEGORY',
}

/**
 * In-app notification events (Phase 9). Each notification is addressed to a
 * single recipient. Delivery is in-app only for now; email is a later channel.
 * Keep the string values stable — they are persisted in the database.
 */
export enum NotificationType {
  // → Bureau admins, when a laboratory sends a report in.
  REPORT_SUBMITTED = 'REPORT_SUBMITTED',
  REPORT_RESUBMITTED = 'REPORT_RESUBMITTED',
  // → the owning laboratory, as a review progresses.
  REPORT_UNDER_REVIEW = 'REPORT_UNDER_REVIEW',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  REPORT_APPROVED = 'REPORT_APPROVED',
  // → the other party in a feedback thread.
  FEEDBACK_RECEIVED = 'FEEDBACK_RECEIVED',
  // → the owning laboratory, from the scheduled reminder sweep (Phase 17), for
  //   an expected-but-unsubmitted report as its due date nears or once it passes.
  DEADLINE_APPROACHING = 'DEADLINE_APPROACHING',
  REPORT_OVERDUE = 'REPORT_OVERDUE',
}

/** High-level audit action catalogue. Extend as features are added. */
export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
  LAB_CREATED = 'LAB_CREATED',
  LAB_UPDATED = 'LAB_UPDATED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  REPORT_CREATED = 'REPORT_CREATED',
  REPORT_UPDATED = 'REPORT_UPDATED',
  REPORT_SUBMITTED = 'REPORT_SUBMITTED',
  REPORT_REVIEW_STARTED = 'REPORT_REVIEW_STARTED',
  REPORT_FEEDBACK_ADDED = 'REPORT_FEEDBACK_ADDED',
  REPORT_REVISION_REQUESTED = 'REPORT_REVISION_REQUESTED',
  REPORT_RESUBMITTED = 'REPORT_RESUBMITTED',
  REPORT_APPROVED = 'REPORT_APPROVED',
  REPORT_EXPORTED = 'REPORT_EXPORTED',
  REPORT_ATTACHMENT_ADDED = 'REPORT_ATTACHMENT_ADDED',
  REPORT_ATTACHMENT_REMOVED = 'REPORT_ATTACHMENT_REMOVED',
  DEFINITION_VERSION_CREATED = 'DEFINITION_VERSION_CREATED',
  DEFINITION_VERSION_PUBLISHED = 'DEFINITION_VERSION_PUBLISHED',
  RULE_CREATED = 'RULE_CREATED',
  RULE_UPDATED = 'RULE_UPDATED',
  RULE_DELETED = 'RULE_DELETED',
  RULE_TEMPLATE_CREATED = 'RULE_TEMPLATE_CREATED',
  RULE_TEMPLATE_UPDATED = 'RULE_TEMPLATE_UPDATED',
}
