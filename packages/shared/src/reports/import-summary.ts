/**
 * Result of a best-effort import of an uploaded spreadsheet into a report
 * {@link FieldSchema} (Phase 23). The parser is a *draft generator, never an
 * authority*: it hands the admin a candidate schema plus this human-readable
 * summary of what it mapped, skipped and was unsure about. The admin then
 * corrects it in the normal Report Builder, and the existing
 * {@link validateFieldSchema} + publish gate stays the only authority on what
 * becomes a live definition.
 */

import { FieldSchema } from './field-schema';

/** A thing the parser successfully mapped, e.g. { label: 'Metrics', count: 7 }. */
export interface ImportStat {
  label: string;
  count: number;
}

/** A thing the admin should check: something skipped, defaulted, or guessed. */
export interface ImportNote {
  message: string;
  /** Optional human-readable spreadsheet location, e.g. "row 14" or "column D". */
  location?: string;
}

export type ImportConfidence = 'high' | 'medium' | 'low';

export interface ImportSummary {
  /** The sheet the schema was parsed from (only the first data sheet is used). */
  sheetName: string;
  /** Which layout the heuristics decided the sheet is. */
  detectedLayout: FieldSchema['layout'];
  /** Rough trust in the mapping; drives how loudly the UI nudges a review. */
  confidence: ImportConfidence;
  /** What was mapped (counts of groups / metrics / rows / sections / fields). */
  mapped: ImportStat[];
  /** Rows/columns set aside (unreadable headers, totals, extra sheets). */
  skipped: ImportNote[];
  /** Assumptions the admin must verify (types defaulted, mask set to all, …). */
  warnings: ImportNote[];
}

/** What the import endpoint returns: a candidate schema + its summary. */
export interface ReportImportResult {
  schema: FieldSchema;
  summary: ImportSummary;
}
