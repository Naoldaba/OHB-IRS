/**
 * Report submission workflow: the single source of truth for the lifecycle
 * state machine from CLAUDE.md. Pure and shared so the API (authority) and the
 * UI (to show/hide actions) agree. No states beyond those in ReportStatus.
 *
 *   DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED
 *   UNDER_REVIEW -> REVISION_REQUIRED -> RESUBMITTED -> UNDER_REVIEW
 */

import { ReportStatus } from '../enums';

export type WorkflowAction =
  | 'submit'
  | 'startReview'
  | 'requestRevision'
  | 'resubmit'
  | 'approve';

interface TransitionDef {
  from: ReportStatus[];
  to: ReportStatus;
  /** Role responsible: 'lab' for the submitting laboratory, 'admin' for bureau. */
  actor: 'lab' | 'admin';
  /** Whether this transition snapshots an immutable SubmissionVersion. */
  snapshots: boolean;
}

export const WORKFLOW_TRANSITIONS: Record<WorkflowAction, TransitionDef> = {
  submit: {
    from: [ReportStatus.DRAFT],
    to: ReportStatus.SUBMITTED,
    actor: 'lab',
    snapshots: true,
  },
  startReview: {
    from: [ReportStatus.SUBMITTED, ReportStatus.RESUBMITTED],
    to: ReportStatus.UNDER_REVIEW,
    actor: 'admin',
    snapshots: false,
  },
  requestRevision: {
    from: [ReportStatus.UNDER_REVIEW],
    to: ReportStatus.REVISION_REQUIRED,
    actor: 'admin',
    snapshots: false,
  },
  resubmit: {
    from: [ReportStatus.REVISION_REQUIRED],
    to: ReportStatus.RESUBMITTED,
    actor: 'lab',
    snapshots: true,
  },
  approve: {
    from: [ReportStatus.UNDER_REVIEW],
    to: ReportStatus.APPROVED,
    actor: 'admin',
    snapshots: false,
  },
};

export function transitionFor(action: WorkflowAction): TransitionDef {
  return WORKFLOW_TRANSITIONS[action];
}

export function canTransition(action: WorkflowAction, current: ReportStatus): boolean {
  return WORKFLOW_TRANSITIONS[action].from.includes(current);
}

/** The resulting status for an action, or null if not allowed from `current`. */
export function nextStatus(
  action: WorkflowAction,
  current: ReportStatus,
): ReportStatus | null {
  return canTransition(action, current) ? WORKFLOW_TRANSITIONS[action].to : null;
}

/** A lab may edit submission data only while drafting or correcting a revision. */
export function canEditData(current: ReportStatus): boolean {
  return current === ReportStatus.DRAFT || current === ReportStatus.REVISION_REQUIRED;
}
