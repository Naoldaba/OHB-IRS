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

import { MatrixStructure } from './matrix-types';

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

export type FieldSchema = SimpleFieldSchema | MatrixFieldSchema;

/** Narrowing helpers (also usable after a jsonb round-trip). */
export function isSimpleSchema(schema: FieldSchema): schema is SimpleFieldSchema {
  return schema.layout === 'simple';
}

export function isMatrixSchema(schema: FieldSchema): schema is MatrixFieldSchema {
  return schema.layout === 'matrix';
}
