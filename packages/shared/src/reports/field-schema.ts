/**
 * Field schema: the layout-agnostic structure of a report, stored in
 * `ReportDefinitionVersion.fieldSchema` (jsonb) and pinned by every submission
 * created under that version. One schema type covers the different report shapes
 * the engine supports without forcing unrelated reports into one form:
 *
 *   - `simple` — sections of typed fields (number, integer, text, date, select).
 *   - `matrix` — rows × column groups × metrics with a per-row applicable mask
 *     (reuses the existing {@link MatrixStructure} contract).
 *
 * Report identity (code/name/category/frequency) lives on the ReportType, not
 * here; the schema describes structure only. The same schema drives both the
 * shared validator (authority) and the render model the UI consumes.
 */

import { ColumnGroupDef, MatrixStructure, MetricDef } from './matrix-types';

export type SimpleFieldType = 'number' | 'integer' | 'text' | 'date' | 'select';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SimpleFieldDef {
  key: string;
  label: string;
  type: SimpleFieldType;
  /** Required at submit time (drafts never enforce required). */
  required?: boolean;
  /** Allowed options for `select` fields. */
  options?: SelectOption[];
  /** Inclusive bounds for `number` / `integer` fields. */
  min?: number;
  max?: number;
  helpText?: string;
}

export interface SimpleSectionDef {
  key: string;
  label: string;
  description?: string;
  fields: SimpleFieldDef[];
}

export interface SimpleFieldSchema {
  layout: 'simple';
  sections: SimpleSectionDef[];
}

export interface MatrixFieldSchema extends MatrixStructure {
  layout: 'matrix';
}

/**
 * A per-row input column of a `table` report (e.g. Zone, Woreda, Referring
 * facility, agreement type). Reuses the simple field types so a dimension can be
 * text, a number/date, or a dropdown.
 */
export interface TableDimensionColumn {
  key: string;
  label: string;
  type: SimpleFieldType;
  /** Required in every row at submit (drafts never enforce required). */
  required?: boolean;
  /** Allowed options for `select` dimensions. */
  options?: SelectOption[];
  helpText?: string;
}

/**
 * `table` — a repeating-row data table: a set of per-row **dimension** input
 * columns, plus grouped numeric **metric** columns (each column group repeats
 * the metric set, as in a matrix). Unlike `matrix`, the rows are **open-ended** —
 * the lab adds one row per entry (e.g. one per referring facility) rather than a
 * fixed named set. Every metric applies to every cell; conditional applicability
 * (e.g. postal vs alternative) is expressed as a configurable business rule, not
 * a static mask.
 */
export interface TableFieldSchema {
  layout: 'table';
  /** Per-row input columns. At least one is required. */
  dimensions: TableDimensionColumn[];
  /** Grouped metric columns (reuses the matrix column-group / metric contract). */
  columnGroups: ColumnGroupDef[];
  metrics: MetricDef[];
  /** Minimum number of rows required at submit (default 0 — rows are optional). */
  minRows?: number;
  /** Optional free-text notes surfaced in the UI. */
  notes?: string[];
}

/**
 * `document` — an attachment-only report. There is **no structured data entry**:
 * the lab uploads file(s) (e.g. a scanned/signed PDF or an Excel workbook) and
 * the submission's `data` stays empty. The admin writes optional instructions,
 * sets how many files are required to submit, and optionally restricts the
 * accepted file types. The "at least N attachments" rule is enforced
 * server-side at submit (the shared data validator only ever sees `data`).
 */
export interface DocumentFieldSchema {
  layout: 'document';
  /** Guidance shown to the lab (what to upload). */
  instructions?: string;
  /** Minimum attachments required to submit (default 1). */
  minAttachments?: number;
  /** Allowed file-type category keys (see FILE_TYPE_CATEGORIES); empty = any. */
  allowedFileTypes?: string[];
}

export type FieldSchema =
  | SimpleFieldSchema
  | MatrixFieldSchema
  | TableFieldSchema
  | DocumentFieldSchema;

/** Narrowing helpers (also usable after a jsonb round-trip). */
export function isSimpleSchema(schema: FieldSchema): schema is SimpleFieldSchema {
  return schema.layout === 'simple';
}

export function isMatrixSchema(schema: FieldSchema): schema is MatrixFieldSchema {
  return schema.layout === 'matrix';
}

export function isTableSchema(schema: FieldSchema): schema is TableFieldSchema {
  return schema.layout === 'table';
}

export function isDocumentSchema(schema: FieldSchema): schema is DocumentFieldSchema {
  return schema.layout === 'document';
}
