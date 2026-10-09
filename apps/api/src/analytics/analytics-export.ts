/**
 * Analytics dashboard export (Phase 19). Turns a {@link DashboardAnalytics} —
 * the exact figures the on-screen dashboard shows — into a downloadable CSV or
 * XLSX. Nothing is recomputed here; the service is the single source of the
 * numbers, so an export always equals what the admin/lab sees.
 */

import ExcelJS from 'exceljs';
import type { DashboardAnalytics, ComplianceCounts } from './analytics.service';

export type AnalyticsExportFormat = 'csv' | 'xlsx';

export interface RenderedAnalyticsExport {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** Column spec shared by the CSV and XLSX laboratory/trend tables. */
const LAB_HEADERS = [
  'Code',
  'Laboratory',
  'Expected',
  'Submitted',
  'Compliance',
  'Approved',
  'In review',
  'Revision required',
  'Overdue',
  'Not yet due',
];

const TREND_HEADERS = [
  'Period',
  'Report type',
  'Eth. year',
  'Period no.',
  'Due date',
  'Expected',
  'Submitted',
  'Compliance',
];

function overviewRows(data: DashboardAnalytics): [string, string | number][] {
  const o = data.overview;
  return [
    ['Generated at', new Date(data.generatedAt).toISOString()],
    ['Active laboratories', o.totalLaboratories],
    ['Report types', o.totalReportTypes],
    ['Expected submissions', o.expected],
    ['Submitted', o.submitted],
    ['Reporting compliance', pct(o.complianceRate)],
    ['Pending review', o.pendingReview],
    ['Approved', o.approved],
    ['Revision required', o.revisionRequired],
    ['Overdue', o.overdue],
    ['Not yet due', o.pending],
    ['Flagged submissions', o.flagged],
  ];
}

function labRow(l: ComplianceCounts & { laboratoryCode: string; laboratoryName: string }) {
  return [
    l.laboratoryCode,
    l.laboratoryName,
    l.expected,
    l.submitted,
    pct(l.complianceRate),
    l.approved,
    l.pendingReview,
    l.revisionRequired,
    l.overdue,
    l.pending,
  ];
}

// ---- CSV --------------------------------------------------------------------

/** RFC-4180-ish escaping: quote when the cell holds a comma, quote or newline. */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(cells: (string | number)[]): string {
  return cells.map(csvCell).join(',');
}

function renderCsv(data: DashboardAnalytics): Buffer {
  const lines: string[] = [];
  lines.push('Bureau compliance & analytics');
  lines.push('');
  lines.push('Overview');
  for (const [label, value] of overviewRows(data)) lines.push(csvLine([label, value]));
  lines.push('');
  lines.push('Laboratories');
  lines.push(csvLine(LAB_HEADERS));
  for (const l of data.laboratories) lines.push(csvLine(labRow(l)));
  lines.push('');
  lines.push('Reporting trend');
  lines.push(csvLine(TREND_HEADERS));
  for (const t of data.trends) {
    lines.push(
      csvLine([
        t.periodLabel,
        t.reportTypeName,
        t.year,
        t.periodNumber,
        new Date(t.dueDate).toISOString().slice(0, 10),
        t.expected,
        t.submitted,
        pct(t.complianceRate),
      ]),
    );
  }
  // Prefix a UTF-8 BOM so Excel opens non-ASCII (e.g. Afaan Oromo period labels) correctly.
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

// ---- XLSX -------------------------------------------------------------------

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F3A5F' },
};

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
}

async function renderXlsx(data: DashboardAnalytics): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OHB Integrated Report System';
  wb.created = new Date(data.generatedAt);

  const overview = wb.addWorksheet('Overview');
  overview.columns = [
    { header: 'Metric', key: 'metric', width: 26 },
    { header: 'Value', key: 'value', width: 24 },
  ];
  styleHeaderRow(overview.getRow(1));
  for (const [label, value] of overviewRows(data)) overview.addRow([label, value]);

  const labs = wb.addWorksheet('Laboratories');
  labs.addRow(LAB_HEADERS);
  styleHeaderRow(labs.getRow(1));
  for (const l of data.laboratories) labs.addRow(labRow(l));
  labs.columns.forEach((c, i) => {
    c.width = i === 1 ? 26 : 14;
  });

  const trends = wb.addWorksheet('Trend');
  trends.addRow(TREND_HEADERS);
  styleHeaderRow(trends.getRow(1));
  for (const t of data.trends) {
    trends.addRow([
      t.periodLabel,
      t.reportTypeName,
      t.year,
      t.periodNumber,
      new Date(t.dueDate).toISOString().slice(0, 10),
      t.expected,
      t.submitted,
      pct(t.complianceRate),
    ]);
  }
  trends.columns.forEach((c) => {
    c.width = 16;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---- Entry point ------------------------------------------------------------

const CONTENT_TYPE: Record<AnalyticsExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export async function renderAnalyticsExport(
  format: AnalyticsExportFormat,
  baseName: string,
  data: DashboardAnalytics,
): Promise<RenderedAnalyticsExport> {
  const buffer = format === 'csv' ? renderCsv(data) : await renderXlsx(data);
  return {
    buffer,
    contentType: CONTENT_TYPE[format],
    filename: `${sanitize(baseName)}.${format}`,
  };
}

function sanitize(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'analytics';
}
