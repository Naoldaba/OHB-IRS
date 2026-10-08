/**
 * Contract for "matrix" style reports: a fixed set of rows, each measured
 * across one or more column groups, where every (row, column group) cell holds
 * the same set of metrics. Not every metric applies to every row, so each row
 * declares which metrics are applicable (the rest render as disabled cells).
 *
 * This is the first report shape the engine supports. Other report shapes can
 * be added later without forcing unrelated reports into this structure.
 */

import { PeriodType } from '../enums';

export type MetricType = 'integer';

export interface MetricDef {
  key: string;
  label: string;
  type: MetricType;
}

export interface ColumnGroupDef {
  key: string;
  label: string;
}

export interface RowDef {
  key: string;
  label: string;
  /** Display label from the source sheet's "sr no" column. */
  srNo: number;
  /** Subset of metric keys that apply to this row. Others are disabled. */
  applicableMetrics: string[];
}

export interface MatrixReportDefinition {
  kind: 'matrix';
  /** Stable machine code; also used as the ReportType.schemaKey. */
  code: string;
  name: string;
  category: string;
  /** Default reporting frequency; the admin may override per requirement. */
  defaultFrequency: PeriodType;
  columnGroups: ColumnGroupDef[];
  metrics: MetricDef[];
  rows: RowDef[];
  /** Optional free-text notes surfaced in the UI. */
  notes?: string[];
}

/** metricKey -> value (null means "not entered"). */
export type MatrixCellValues = Record<string, number | null>;
/** columnGroupKey -> cell values. */
export type MatrixRowValues = Record<string, MatrixCellValues>;

export interface MatrixReportData {
  /** rowKey -> per-column-group cell values. */
  rows: Record<string, MatrixRowValues>;
}
