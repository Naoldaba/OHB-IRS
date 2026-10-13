/**
 * Export document model — a format-agnostic intermediate representation built
 * once from a submission's shared `RenderModel` + stored `data`, then consumed
 * by the Excel / DOCX / PDF renderers. Keeping the (matrix vs simple) branching
 * here means the three renderers only ever deal with flat blocks, so they stay
 * small and stay consistent with each other and with the on-screen renderer.
 */

import type { Diagnostic, RenderModel } from '@ohb/shared';

export interface ExportMetaRow {
  label: string;
  value: string;
}

/** A labelled key/value block — one `simple`-layout section. */
export interface KeyValueBlock {
  kind: 'keyval';
  heading: string;
  description?: string;
  rows: { label: string; value: string }[];
}

/** One matrix cell: a value string, or a disabled (not-applicable) cell. */
export interface MatrixExportCell {
  enabled: boolean;
  /** Display text for an applicable cell; '' when the applicable cell is empty. */
  value: string;
}

/** A matrix grid block — grouped column headers over repeated metrics. */
export interface MatrixBlock {
  kind: 'matrix';
  rowHeaderLabel: string;
  columnGroups: { key: string; label: string }[];
  metrics: { key: string; label: string }[];
  rows: {
    srNo: number;
    label: string;
    /** cells[groupIndex][metricIndex] — aligned to columnGroups × metrics. */
    cells: MatrixExportCell[][];
  }[];
  notes?: string[];
}

/** A repeating-row table block — dimension columns + grouped metric columns. */
export interface TableBlock {
  kind: 'table';
  dimensions: { key: string; label: string }[];
  columnGroups: { key: string; label: string }[];
  metrics: { key: string; label: string }[];
  rows: {
    /** Display values aligned to `dimensions`. */
    dimensions: string[];
    /** cells[groupIndex][metricIndex] — aligned to columnGroups × metrics. */
    cells: string[][];
  }[];
  /** Column sums (auto totals), [groupIndex][metricIndex]; null when no rows. */
  totals: number[][] | null;
  notes?: string[];
}

export type ExportBlock = KeyValueBlock | MatrixBlock | TableBlock;

export interface ExportFlag {
  message: string;
  fieldPath?: string;
}

export interface ExportDocModel {
  title: string;
  subtitle?: string;
  meta: ExportMetaRow[];
  blocks: ExportBlock[];
  flags: ExportFlag[];
  generatedAt: Date;
  generatedBy?: string;
}

type Data = Record<string, unknown>;

const EMPTY = '';

/** Formats a stored scalar for display; disabled/empty cells handled by caller. */
function displayScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export interface BuildExportDocArgs {
  title: string;
  subtitle?: string;
  meta: ExportMetaRow[];
  renderModel: RenderModel;
  data: Data;
  flags?: Diagnostic[];
  generatedAt?: Date;
  generatedBy?: string;
}

/**
 * Normalize a render model + submission data into the format-agnostic export
 * model. Select values are resolved to their option labels (mirroring the
 * read-mode on-screen renderer); matrix cells preserve the applicable-metric
 * mask so disabled cells stay visually distinct in every format.
 */
export function buildExportDocModel(args: BuildExportDocArgs): ExportDocModel {
  const { renderModel, data } = args;
  const blocks: ExportBlock[] = [];

  if (renderModel.layout === 'document') {
    const rows: { label: string; value: string }[] = [
      { label: 'Report type', value: 'Attachment-only (document)' },
    ];
    if (renderModel.instructions) rows.push({ label: 'Instructions', value: renderModel.instructions });
    rows.push({
      label: 'Attachments',
      value: 'This report is submitted as file attachment(s); download them from the submission page.',
    });
    blocks.push({ kind: 'keyval', heading: 'Document report', rows });
  } else if (renderModel.layout === 'simple') {
    const values = (data?.values ?? {}) as Record<string, unknown>;
    for (const section of renderModel.sections) {
      blocks.push({
        kind: 'keyval',
        heading: section.label,
        description: section.description,
        rows: section.fields.map((field) => {
          const raw = values[field.key];
          let value = displayScalar(raw);
          if (field.type === 'select' && field.options) {
            value = field.options.find((o) => o.value === raw)?.label ?? value;
          }
          return { label: field.label, value };
        }),
      });
    }
  } else if (renderModel.layout === 'table') {
    const rawRows = Array.isArray((data as { rows?: unknown })?.rows)
      ? ((data as { rows: Record<string, unknown>[] }).rows)
      : [];
    // Column sums (auto totals) — the same figures shown on screen.
    const totals = renderModel.columnGroups.map(() => renderModel.metrics.map(() => 0));
    for (const row of rawRows) {
      const cells = (row?.cells ?? {}) as Record<string, Record<string, unknown>>;
      renderModel.columnGroups.forEach((group, gi) =>
        renderModel.metrics.forEach((metric, mi) => {
          const v = cells?.[group.key]?.[metric.key];
          if (typeof v === 'number') totals[gi][mi] += v;
        }),
      );
    }
    blocks.push({
      kind: 'table',
      dimensions: renderModel.dimensions.map((d) => ({ key: d.key, label: d.label })),
      columnGroups: renderModel.columnGroups,
      metrics: renderModel.metrics,
      rows: rawRows.map((row) => {
        const dims = (row?.dimensions ?? {}) as Record<string, unknown>;
        const cells = (row?.cells ?? {}) as Record<string, Record<string, unknown>>;
        return {
          dimensions: renderModel.dimensions.map((d) => {
            const raw = dims[d.key];
            if (d.type === 'select' && d.options) {
              return d.options.find((o) => o.value === raw)?.label ?? displayScalar(raw);
            }
            return displayScalar(raw);
          }),
          cells: renderModel.columnGroups.map((group) =>
            renderModel.metrics.map((metric) => displayScalar(cells?.[group.key]?.[metric.key])),
          ),
        };
      }),
      totals: rawRows.length > 0 ? totals : null,
      notes: renderModel.notes,
    });
  } else {
    const rows = (data?.rows ?? {}) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    blocks.push({
      kind: 'matrix',
      rowHeaderLabel: 'Test / Indicator',
      columnGroups: renderModel.columnGroups,
      metrics: renderModel.metrics,
      rows: renderModel.rows.map((row) => ({
        srNo: row.srNo,
        label: row.label,
        cells: renderModel.columnGroups.map((group) =>
          row.cells[group.key].map((cell) => {
            if (!cell.enabled) return { enabled: false, value: EMPTY };
            const raw = rows?.[row.key]?.[group.key]?.[cell.metricKey];
            return { enabled: true, value: displayScalar(raw) };
          }),
        ),
      })),
      notes: renderModel.notes,
    });
  }

  return {
    title: args.title,
    subtitle: args.subtitle,
    meta: args.meta,
    blocks,
    flags: (args.flags ?? []).map((f) => ({ message: f.message, fieldPath: f.fieldPath })),
    generatedAt: args.generatedAt ?? new Date(),
    generatedBy: args.generatedBy,
  };
}
