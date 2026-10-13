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
  isDocumentSchema,
  isMatrixSchema,
  isTableSchema,
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

/**
 * `table` render model. Rows are open-ended (the lab adds them), so the model
 * describes the **column structure** — the per-row dimension inputs and the
 * grouped metric columns — and the renderer composes concrete per-row paths
 * (`rows[i].dimensions.<key>` / `rows[i].cells.<group>.<metric>`).
 */
export interface RenderTableDimension {
  key: string;
  label: string;
  type: SimpleFieldType;
  required: boolean;
  options?: SelectOption[];
  helpText?: string;
}

export interface TableRenderModel {
  layout: 'table';
  dimensions: RenderTableDimension[];
  columnGroups: { key: string; label: string }[];
  metrics: { key: string; label: string }[];
  minRows: number;
  notes?: string[];
}

/** `document` render model — attachment-only, no fields. */
export interface DocumentRenderModel {
  layout: 'document';
  instructions?: string;
  minAttachments: number;
  allowedFileTypes: string[];
}

export type RenderModel =
  | SimpleRenderModel
  | MatrixRenderModel
  | TableRenderModel
  | DocumentRenderModel;

export function buildRenderModel(schema: FieldSchema): RenderModel {
  if (isDocumentSchema(schema)) {
    return {
      layout: 'document',
      instructions: schema.instructions,
      minAttachments: schema.minAttachments ?? 1,
      allowedFileTypes: schema.allowedFileTypes ?? [],
    };
  }
  if (isTableSchema(schema)) {
    return {
      layout: 'table',
      dimensions: schema.dimensions.map((d) => ({
        key: d.key,
        label: d.label,
        type: d.type,
        required: d.required ?? false,
        options: d.options,
        helpText: d.helpText,
      })),
      columnGroups: schema.columnGroups.map((g) => ({ key: g.key, label: g.label })),
      metrics: schema.metrics.map((m) => ({ key: m.key, label: m.label })),
      minRows: schema.minRows ?? 0,
      notes: schema.notes,
    };
  }

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
