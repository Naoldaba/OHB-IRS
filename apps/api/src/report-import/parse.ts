/**
 * Best-effort spreadsheet → report {@link FieldSchema} parser (Phase 23).
 *
 * Pure and ExcelJS-free: it works on a normalized {@link Grid} (a rectangular
 * array of {@link GridCell}, with merged regions already expanded by the caller)
 * so it can be unit-tested with plain arrays. It NEVER throws on an ugly sheet —
 * it maps what it can, records the rest in the {@link ImportSummary}, and leaves
 * the admin to finish in the builder. The only hard failure is an empty sheet,
 * which the caller guards before calling here.
 *
 * Heuristics are deliberately tuned to the two shapes the engine supports: a
 * matrix grid (the HIV Viral Load shape — a label column, optional "sr no"
 * column, one or two header rows of column groups × metrics, then a numeric
 * body) and a generic simple-sections list. Anything it cannot infer (select
 * options, required-ness, calculated fields, the per-row applicable mask) is
 * defaulted and flagged, not guessed.
 */

import type {
  FieldSchema,
  ImportNote,
  ImportSummary,
  MatrixFieldSchema,
  MetricDef,
  ReportImportResult,
  RowDef,
  SimpleFieldDef,
  SimpleFieldSchema,
  SimpleFieldType,
} from '@ohb/shared';

export interface GridCell {
  /** Trimmed display text of the cell ('' when blank). */
  text: string;
  /** Parsed numeric value when the cell is a plain number, else null. */
  numeric: number | null;
}

/** Row-major, 0-indexed, rectangular grid of cells. */
export type Grid = GridCell[][];

const TOTAL_LABEL = /\b(sub[\s-]?total|totals?|grand\s+total)\b/i;
const SRNO_HEADER = /^(sr\.?\s*no\.?|s\.?\s*no\.?|no\.?|#|serial)$/i;

/** A merged "key factory": slugified, unique, never empty. */
function keyFactory(): (label: string, fallback: string) => string {
  const used = new Set<string>();
  return (label, fallback) => {
    const base = slugify(label) || fallback;
    let key = base;
    let n = 2;
    while (used.has(key)) key = `${base}_${n++}`;
    used.add(key);
    return key;
  };
}

/** Same contract as the web `slugifyKey`: lower_snake_case starting with a letter. */
function slugify(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) return '';
  return /^[a-z]/.test(base) ? base : `f_${base}`;
}

/** Bounding box of non-empty cells. Returns null when the grid is entirely blank. */
export function boundingRegion(grid: Grid): Grid | null {
  let top = Infinity;
  let bottom = -1;
  let left = Infinity;
  let right = -1;
  grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.text !== '') {
        top = Math.min(top, r);
        bottom = Math.max(bottom, r);
        left = Math.min(left, c);
        right = Math.max(right, c);
      }
    }),
  );
  if (bottom < 0) return null;
  const region: Grid = [];
  for (let r = top; r <= bottom; r += 1) {
    const row: GridCell[] = [];
    for (let c = left; c <= right; c += 1) {
      row.push(grid[r][c] ?? { text: '', numeric: null });
    }
    region.push(row);
  }
  return region;
}

function textFraction(cells: GridCell[]): number {
  const nonEmpty = cells.filter((c) => c.text !== '');
  if (nonEmpty.length === 0) return 0;
  return nonEmpty.filter((c) => c.numeric === null).length / nonEmpty.length;
}

function column(region: Grid, c: number): GridCell[] {
  return region.map((row) => row[c] ?? { text: '', numeric: null });
}

/**
 * Decide the layout. Matrix needs a label column plus a header row carrying at
 * least two column captions over a body; everything else (including a narrow
 * two-column list) reads as a simple section.
 */
function detectLayout(region: Grid): { layout: FieldSchema['layout']; twoHeaderRows: boolean } {
  const rows = region.length;
  const cols = region[0]?.length ?? 0;
  if (cols < 2 || rows < 2) return { layout: 'simple', twoHeaderRows: false };

  // A two-row header shows up as a top row whose captions repeat across adjacent
  // columns (merged group spans), over a second row of per-column captions.
  const row0 = region[0];
  const row1 = region[1];
  let adjacentRepeats = 0;
  for (let c = 2; c < cols; c += 1) {
    if (row0[c].text !== '' && row0[c].text === row0[c - 1].text) adjacentRepeats += 1;
  }
  const twoHeaderRows =
    rows >= 3 && adjacentRepeats >= 1 && textFraction(row1.slice(1)) >= 0.6;

  const headerCaptions = row0.slice(1).filter((c) => c.text !== '').length;
  // The label column is col 0, or col 1 when col 0 is an "sr no" index column —
  // so a matrix qualifies if *either* of the first two columns reads as labels.
  const bodyStart = twoHeaderRows ? 2 : 1;
  const col0Labels = textFraction(column(region, 0).slice(bodyStart));
  const col1Labels = cols >= 2 ? textFraction(column(region, 1).slice(bodyStart)) : 0;
  const firstColIsLabels = Math.max(col0Labels, col1Labels) >= 0.5;
  const matrix = headerCaptions >= 2 && firstColIsLabels;
  return { layout: matrix ? 'matrix' : 'simple', twoHeaderRows };
}

function parseMatrix(region: Grid, twoHeaderRows: boolean): ReportImportResult {
  const cols = region[0].length;
  const skipped: ImportNote[] = [];
  const warnings: ImportNote[] = [];

  // Locate an optional "sr no" column so the first text column becomes the label.
  const headerForLabels = region[twoHeaderRows ? 1 : 0];
  const bodyStart = twoHeaderRows ? 2 : 1;
  const srCol =
    cols >= 2 &&
    (SRNO_HEADER.test(headerForLabels[0]?.text ?? '') ||
      textFraction(column(region, 0).slice(bodyStart)) < 0.3)
      ? 0
      : -1;
  const labelCol = srCol === 0 ? 1 : 0;
  const dataStart = labelCol + 1;

  // Column groups + metrics.
  const groupKey = keyFactory();
  const metricKey = keyFactory();
  const columnGroups: { key: string; label: string }[] = [];
  const metrics: MetricDef[] = [];
  // Map each data column -> { groupIdx, metricIdx } so rows know which cell is which.
  const colGroup: number[] = [];
  const colMetric: number[] = [];

  if (twoHeaderRows) {
    const groupRow = region[0];
    const metricRow = region[1];
    const groupIndexByLabel = new Map<string, number>();
    const metricIndexByLabel = new Map<string, number>();
    for (let c = dataStart; c < cols; c += 1) {
      const gLabel = groupRow[c].text || `Group ${columnGroups.length + 1}`;
      const mLabel = metricRow[c].text || `Metric ${metrics.length + 1}`;
      if (metricRow[c].text === '' && groupRow[c].text === '') {
        skipped.push({ message: 'Blank header column ignored', location: colLetter(c) });
        continue;
      }
      let gi = groupIndexByLabel.get(gLabel);
      if (gi === undefined) {
        gi = columnGroups.length;
        groupIndexByLabel.set(gLabel, gi);
        columnGroups.push({ key: groupKey(gLabel, `group_${gi + 1}`), label: gLabel });
      }
      let mi = metricIndexByLabel.get(mLabel);
      if (mi === undefined) {
        mi = metrics.length;
        metricIndexByLabel.set(mLabel, mi);
        metrics.push({ key: metricKey(mLabel, `metric_${mi + 1}`), label: mLabel, type: 'integer' });
      }
      colGroup[c] = gi;
      colMetric[c] = mi;
    }
  } else {
    // Single header row: one implicit group, each header cell is a metric.
    const headerRow = region[0];
    columnGroups.push({ key: groupKey('Data', 'group_1'), label: 'Data' });
    for (let c = dataStart; c < cols; c += 1) {
      const label = headerRow[c].text;
      if (label === '') {
        skipped.push({ message: 'Blank header column ignored', location: colLetter(c) });
        continue;
      }
      const mi = metrics.length;
      metrics.push({ key: metricKey(label, `metric_${mi + 1}`), label, type: 'integer' });
      colGroup[c] = 0;
      colMetric[c] = mi;
    }
  }

  // Rows.
  const rowKey = keyFactory();
  const rows: RowDef[] = [];
  const allMetricKeys = metrics.map((m) => m.key);
  let srCounter = 0;
  for (let r = bodyStart; r < region.length; r += 1) {
    const label = region[r][labelCol]?.text ?? '';
    if (label === '') continue;
    if (TOTAL_LABEL.test(label)) {
      skipped.push({ message: `Total/subtotal row set aside: "${label}"`, location: `row ${r + 1}` });
      continue;
    }
    srCounter += 1;
    const srFromSheet = srCol >= 0 ? region[r][srCol]?.numeric ?? null : null;
    rows.push({
      key: rowKey(label, `row_${srCounter}`),
      label,
      srNo: srFromSheet ?? srCounter,
      // The sheet is a blank template, so the real applicable mask cannot be
      // inferred — default to all and let the admin trim (plan §23).
      applicableMetrics: [...allMetricKeys],
    });
  }

  if (rows.length > 0 && metrics.length > 0) {
    warnings.push({
      message:
        'Every metric was marked applicable to every row — trim the greyed-cell mask per row where a metric does not apply.',
    });
  }

  const schema: MatrixFieldSchema = {
    layout: 'matrix',
    columnGroups,
    metrics,
    rows,
    notes: [],
  };

  const summary: ImportSummary = {
    sheetName: '',
    detectedLayout: 'matrix',
    confidence: twoHeaderRows && metrics.length > 0 ? 'high' : 'medium',
    mapped: [
      { label: 'Column groups', count: columnGroups.length },
      { label: 'Metrics', count: metrics.length },
      { label: 'Rows', count: rows.length },
    ],
    skipped,
    warnings,
  };
  return { schema, summary };
}

function inferFieldType(valueCell: GridCell | undefined): SimpleFieldType {
  if (!valueCell || valueCell.text === '') return 'text';
  if (valueCell.numeric !== null) {
    return Number.isInteger(valueCell.numeric) ? 'integer' : 'number';
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(valueCell.text)) return 'date';
  return 'text';
}

function parseSimple(region: Grid): ReportImportResult {
  const warnings: ImportNote[] = [];
  const skipped: ImportNote[] = [];
  const fieldKey = keyFactory();
  const fields: SimpleFieldDef[] = [];

  for (let r = 0; r < region.length; r += 1) {
    const row = region[r];
    const labelCell = row.find((c) => c.text !== '');
    if (!labelCell) continue;
    const label = labelCell.text;
    // Skip a standalone title row (single cell, looks like a heading not a field).
    const nonEmpty = row.filter((c) => c.text !== '');
    const valueCell = row.find((c) => c !== labelCell && c.text !== '');
    fields.push({
      key: fieldKey(label, `field_${fields.length + 1}`),
      label,
      type: inferFieldType(valueCell),
    });
    if (nonEmpty.length > 2) {
      skipped.push({
        message: `Row had extra columns beyond label/value; only the first field was created`,
        location: `row ${r + 1}`,
      });
    }
  }

  warnings.push({
    message:
      'Field types were guessed from sample values and required-ness was not set. Review each field, and add any dropdown (select) options manually — they cannot be inferred.',
  });

  const schema: SimpleFieldSchema = {
    layout: 'simple',
    sections: [
      {
        key: 'imported',
        label: 'Imported fields',
        fields,
      },
    ],
  };
  const summary: ImportSummary = {
    sheetName: '',
    detectedLayout: 'simple',
    confidence: 'low',
    mapped: [
      { label: 'Sections', count: 1 },
      { label: 'Fields', count: fields.length },
    ],
    skipped,
    warnings,
  };
  return { schema, summary };
}

/** Spreadsheet-style column letter for a 0-indexed column (0 -> A, 26 -> AA). */
export function colLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `column ${s}`;
}

/**
 * Parse a normalized grid into a candidate report schema + summary. Assumes the
 * caller has already rejected a wholly-empty sheet; still tolerant of ragged
 * real-world sheets.
 */
export function parseGridToReport(grid: Grid): ReportImportResult {
  const region = boundingRegion(grid);
  if (!region) {
    // Defensive: the service guards emptiness, but keep a valid, obviously-empty
    // simple schema rather than throwing from a pure function.
    return parseSimple([[{ text: '', numeric: null }]]);
  }
  const { layout, twoHeaderRows } = detectLayout(region);
  return layout === 'matrix' ? parseMatrix(region, twoHeaderRows) : parseSimple(region);
}
