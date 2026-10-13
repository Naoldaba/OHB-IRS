/**
 * Cross-entity search result shapes (Phase 25), shared between the API (which
 * fills them from Postgres full-text queries) and the web app (which renders
 * them as grouped, typed results). Results are always role/lab-scoped by the
 * server — a lab head only ever sees its own laboratory's submissions/feedback.
 */

export interface ReportTypeSearchHit {
  id: string;
  name: string;
  code: string;
  description: string | null;
  /** Postgres ts_rank score (higher = better match). */
  rank: number;
}

export interface SubmissionSearchHit {
  id: string;
  status: string;
  reportTypeName: string;
  reportTypeCode: string;
  laboratoryId: string;
  laboratoryName: string;
  periodLabel: string;
  /** ISO timestamp of the submission's last update. */
  updatedAt: string;
  rank: number;
}

export interface FeedbackSearchHit {
  id: string;
  submissionId: string;
  type: string;
  /** Plain-text excerpt of the matched feedback message (truncated, not HTML). */
  snippet: string;
  authorName: string;
  /** ISO timestamp. */
  createdAt: string;
  rank: number;
}

/** The full grouped result set returned by `GET /search`. */
export interface SearchResults {
  query: string;
  reportTypes: ReportTypeSearchHit[];
  submissions: SubmissionSearchHit[];
  feedback: FeedbackSearchHit[];
  /** Total hits across every group (what the header badge counts). */
  total: number;
}
