/**
 * Shared, authoritative validation for `table` (repeating-row) report data.
 * Mirrors the matrix validator's contract: rules are derived strictly from the
 * schema (dimension types + metric cells), with no invented domain rules.
 *
 * Data shape:
 *   { rows: [ { dimensions: { <dimKey>: value }, cells: { <groupKey>: { <metricKey>: number } } }, … ] }
 *
 * Normalization drops unknown keys and **fully-blank rows** (a row with no
 * dimension value and no cell value) so an accidental empty row never blocks a
 * submit. Error paths are row-indexed: `rows[i].dimensions.<key>` /
 * `rows[i].cells.<group>.<metric>`.
 */

import { SelectOption, TableFieldSchema } from './field-schema';
import { ValidateOptions, ValidationError, ValidationResult } from './validate-matrix';

export type TableCellValues = Record<string, number | null>; // metricKey -> value
export type TableRowCells = Record<string, TableCellValues>; // groupKey -> cells

export interface TableRowData {
  dimensions: Record<string, string | number | null>;
  cells: TableRowCells;
}

export interface TableReportData {
  rows: TableRowData[];
}

export interface TableValidationResult extends Omit<ValidationResult, 'normalized'> {
  normalized: TableReportData;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function validateTableReportData(
  def: TableFieldSchema,
  data: unknown,
  options: ValidateOptions,
): TableValidationResult {
  const errors: ValidationError[] = [];
  const normalizedRows: TableRowData[] = [];

  const rawRows: unknown[] =
    data && typeof data === 'object' && Array.isArray((data as TableReportData).rows)
      ? (data as TableReportData).rows
      : [];

  rawRows.forEach((rawRow, ri) => {
    const rowObj = (rawRow && typeof rawRow === 'object' ? rawRow : {}) as Partial<TableRowData>;
    const rawDims = (rowObj.dimensions ?? {}) as Record<string, unknown>;
    const rawCells = (rowObj.cells ?? {}) as Record<string, unknown>;

    // First pass: is the row entirely blank? If so it is dropped (not an error).
    const anyDim = def.dimensions.some((d) => !isBlank(rawDims[d.key]));
    const anyCell = def.columnGroups.some((g) => {
      const groupCells = rawCells[g.key] as Record<string, unknown> | undefined;
      return def.metrics.some((m) => groupCells && !isBlank(groupCells[m.key]));
    });
    if (!anyDim && !anyCell) return; // drop fully-blank row

    const normDims: Record<string, string | number | null> = {};
    for (const dim of def.dimensions) {
      const path = `rows[${ri}].dimensions.${dim.key}`;
      normDims[dim.key] = coerceDimension(dim.type, dim.options, rawDims[dim.key], path, dim, options, errors);
    }

    const normCells: TableRowCells = {};
    for (const group of def.columnGroups) {
      const groupCells = rawCells[group.key] as Record<string, unknown> | undefined;
      const normCell: TableCellValues = {};
      for (const metric of def.metrics) {
        const path = `rows[${ri}].cells.${group.key}.${metric.key}`;
        const value = groupCells ? groupCells[metric.key] : undefined;
        // Metric cells are optional even at submit: in a table report a metric may
        // be conditionally not-applicable to a given row (e.g. postal vs alternative
        // means), and the schema has no static mask to know which. A blank cell is
        // allowed; only a present value is type-checked. (A later per-row rule can
        // require specific cells.)
        if (isBlank(value)) {
          normCell[metric.key] = null;
          continue;
        }
        const coerced = typeof value === 'string' ? Number(value) : value;
        if (!isNonNegativeInteger(coerced)) {
          errors.push({
            path,
            message: `Row ${ri + 1} / ${group.label} / ${metric.label} must be a non-negative whole number`,
          });
          normCell[metric.key] = null;
          continue;
        }
        normCell[metric.key] = coerced;
      }
      normCells[group.key] = normCell;
    }

    normalizedRows.push({ dimensions: normDims, cells: normCells });
  });

  const minRows = def.minRows ?? 0;
  if (options.requireComplete && normalizedRows.length < minRows) {
    errors.push({
      path: 'rows',
      message: `At least ${minRows} row(s) are required (got ${normalizedRows.length}).`,
    });
  }

  return { ok: errors.length === 0, errors, normalized: { rows: normalizedRows } };
}

function coerceDimension(
  type: TableFieldSchema['dimensions'][number]['type'],
  options: SelectOption[] | undefined,
  raw: unknown,
  path: string,
  dim: { label: string; required?: boolean },
  opts: ValidateOptions,
  errors: ValidationError[],
): string | number | null {
  if (isBlank(raw)) {
    if (opts.requireComplete && dim.required) {
      errors.push({ path, message: `${dim.label} is required` });
    }
    return null;
  }

  switch (type) {
    case 'integer':
    case 'number': {
      const coerced = typeof raw === 'string' ? Number(raw) : raw;
      if (typeof coerced !== 'number' || Number.isNaN(coerced)) {
        errors.push({ path, message: `${dim.label} must be a number` });
        return null;
      }
      if (type === 'integer' && !Number.isInteger(coerced)) {
        errors.push({ path, message: `${dim.label} must be a whole number` });
        return null;
      }
      return coerced;
    }
    case 'select': {
      const allowed = (options ?? []).map((o) => o.value);
      if (!allowed.includes(String(raw))) {
        errors.push({ path, message: `${dim.label} must be one of the allowed options` });
        return null;
      }
      return String(raw);
    }
    case 'date': {
      const str = String(raw);
      if (Number.isNaN(Date.parse(str))) {
        errors.push({ path, message: `${dim.label} must be a valid date` });
        return null;
      }
      return str;
    }
    case 'text':
    default:
      return String(raw);
  }
}

/** Empty data skeleton for a new draft — no rows yet (the lab adds them). */
export function emptyTableData(): TableReportData {
  return { rows: [] };
}

/** A single blank row shaped to the schema (dimensions + cells null). */
export function emptyTableRow(def: TableFieldSchema): TableRowData {
  const dimensions: Record<string, string | number | null> = {};
  for (const dim of def.dimensions) dimensions[dim.key] = null;
  const cells: TableRowCells = {};
  for (const group of def.columnGroups) {
    const cell: TableCellValues = {};
    for (const metric of def.metrics) cell[metric.key] = null;
    cells[group.key] = cell;
  }
  return { dimensions, cells };
}
