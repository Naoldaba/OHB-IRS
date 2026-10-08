/**
 * Render model: a normalized, layout-aware descriptor derived from a report's
 * `fieldSchema` that a UI renders directly and that diagnostics map back to by
 * `path`. This is the reusable "renderer" core of Phase 3 — the shared structure
 * both the lab data-entry form (Phase 4 web app) and the validator agree on.
 *
 * Every entry carries a stable dot `path` into the submission data so a form
 * control, a validation error, and a stored value all line up.
 */

import {
  FieldSchema,
  isMatrixSchema,
  SelectOption,
  SimpleFieldType,
} from './field-schema';

export interface RenderSimpleField {
  path: string; // e.g. "sectionKey.fieldKey" within data.values[fieldKey]
  key: string;
  label: string;
  type: SimpleFieldType;
  required: boolean;
  options?: SelectOption[];
  min?: number;
  max?: number;
  helpText?: string;
}

export interface RenderSimpleSection {
  key: string;
  label: string;
  description?: string;
  fields: RenderSimpleField[];
}

export interface SimpleRenderModel {
  layout: 'simple';
  sections: RenderSimpleSection[];
}

export interface RenderMatrixCell {
  path: string; // "rows.<rowKey>.<groupKey>.<metricKey>"
  metricKey: string;
  /** Applicable cells are editable; the rest render as disabled (grey) cells. */
  enabled: boolean;
}

export interface RenderMatrixRow {
  key: string;
  label: string;
  srNo: number;
  /** columnGroupKey -> ordered cells (one per metric, in schema metric order). */
  cells: Record<string, RenderMatrixCell[]>;
}

export interface MatrixRenderModel {
  layout: 'matrix';
  columnGroups: { key: string; label: string }[];
  metrics: { key: string; label: string }[];
  rows: RenderMatrixRow[];
  notes?: string[];
}

export type RenderModel = SimpleRenderModel | MatrixRenderModel;

export function buildRenderModel(schema: FieldSchema): RenderModel {
  if (isMatrixSchema(schema)) {
    return {
      layout: 'matrix',
      columnGroups: schema.columnGroups.map((g) => ({ key: g.key, label: g.label })),
      metrics: schema.metrics.map((m) => ({ key: m.key, label: m.label })),
      rows: schema.rows.map((row) => {
        const applicable = new Set(row.applicableMetrics);
        const cells: Record<string, RenderMatrixCell[]> = {};
        for (const group of schema.columnGroups) {
          cells[group.key] = schema.metrics.map((metric) => ({
            path: `rows.${row.key}.${group.key}.${metric.key}`,
            metricKey: metric.key,
            enabled: applicable.has(metric.key),
          }));
        }
        return { key: row.key, label: row.label, srNo: row.srNo, cells };
      }),
      notes: schema.notes,
    };
  }

  return {
    layout: 'simple',
    sections: schema.sections.map((section) => ({
      key: section.key,
      label: section.label,
      description: section.description,
      fields: section.fields.map((field) => ({
        path: `${section.key}.${field.key}`,
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required ?? false,
        options: field.options,
        min: field.min,
        max: field.max,
        helpText: field.helpText,
      })),
    })),
  };
}
