/**
 * Shared, authoritative validation for matrix report data. Used by the web app
 * for UX and by the API as the source of truth. The rules here are derived
 * strictly from the report definition (the applicable-metric mask), NOT from
 * domain assumptions. No cross-field totals are enforced unless a definition
 * explicitly asks for it in the future.
 */

import {
  MatrixReportData,
  MatrixReportDefinition,
} from './matrix-types';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  /** Cleaned data: only applicable cells kept, disabled cells dropped. */
  normalized: MatrixReportData;
}

export interface ValidateOptions {
  /**
   * When true (submission), every applicable cell must hold a non-negative
   * integer. When false (draft), applicable cells may be left empty.
   */
  requireComplete: boolean;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function validateMatrixReportData(
  def: MatrixReportDefinition,
  data: unknown,
  options: ValidateOptions,
): ValidationResult {
  const errors: ValidationError[] = [];
  const normalized: MatrixReportData = { rows: {} };

  const rawRows =
    data && typeof data === 'object' && 'rows' in (data as object)
      ? ((data as MatrixReportData).rows ?? {})
      : {};

  for (const row of def.rows) {
    const applicable = new Set(row.applicableMetrics);
    const rawRow = (rawRows as Record<string, unknown>)[row.key];
    const normalizedRow: Record<string, Record<string, number | null>> = {};

    for (const group of def.columnGroups) {
      const rawCell =
        rawRow && typeof rawRow === 'object'
          ? ((rawRow as Record<string, unknown>)[group.key] as
              | Record<string, unknown>
              | undefined)
          : undefined;
      const normalizedCell: Record<string, number | null> = {};

      for (const metric of def.metrics) {
        if (!applicable.has(metric.key)) continue; // disabled cell -> dropped
        const path = `${row.key}.${group.key}.${metric.key}`;
        const value = rawCell ? rawCell[metric.key] : undefined;

        if (value === undefined || value === null || value === '') {
          if (options.requireComplete) {
            errors.push({ path, message: `${row.label} / ${group.label} / ${metric.label} is required` });
          }
          normalizedCell[metric.key] = null;
          continue;
        }

        const coerced = typeof value === 'string' ? Number(value) : value;
        if (!isNonNegativeInteger(coerced)) {
          errors.push({
            path,
            message: `${row.label} / ${group.label} / ${metric.label} must be a non-negative whole number`,
          });
          normalizedCell[metric.key] = null;
          continue;
        }
        normalizedCell[metric.key] = coerced;
      }

      normalizedRow[group.key] = normalizedCell;
    }

    normalized.rows[row.key] = normalizedRow;
  }

  return { ok: errors.length === 0, errors, normalized };
}

/** Empty data skeleton (all applicable cells null) for a new draft. */
export function emptyMatrixData(def: MatrixReportDefinition): MatrixReportData {
  const data: MatrixReportData = { rows: {} };
  for (const row of def.rows) {
    const applicable = new Set(row.applicableMetrics);
    data.rows[row.key] = {};
    for (const group of def.columnGroups) {
      const cell: Record<string, number | null> = {};
      for (const metric of def.metrics) {
        if (applicable.has(metric.key)) cell[metric.key] = null;
      }
      data.rows[row.key][group.key] = cell;
    }
  }
  return data;
}
