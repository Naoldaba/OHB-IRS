/**
 * Excel (.xlsx) renderer for a submission export, built on exceljs. One sheet:
 * a title + metadata header, then each block (simple key/value sections or the
 * matrix grid with merged grouped headers), then any FLAG outcomes. Disabled
 * matrix cells are shaded so the applicable-metric mask reads the same as on
 * screen.
 */

import ExcelJS from 'exceljs';
import type { ExportDocModel, MatrixBlock, TableBlock } from '../export-model';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F3A5F' },
};
const GROUP_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEEF2F7' },
};
const DISABLED_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2E8F0' },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

export async function renderXlsx(doc: ExportDocModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OHB Integrated Report System';
  wb.created = doc.generatedAt;
  const ws = wb.addWorksheet('Report', {
    views: [{ showGridLines: false }],
  });

  // Title + subtitle.
  let r = 1;
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = doc.title;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FF0F1E33' } };
  r += 1;
  if (doc.subtitle) {
    const sub = ws.getCell(`A${r}`);
    sub.value = doc.subtitle;
    sub.font = { size: 11, color: { argb: 'FF64748B' } };
    r += 1;
  }
  r += 1;

  // Metadata table (label | value).
  for (const m of doc.meta) {
    ws.getCell(`A${r}`).value = m.label;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF475569' } };
    ws.getCell(`B${r}`).value = m.value;
    r += 1;
  }
  r += 1;

  for (const block of doc.blocks) {
    if (block.kind === 'keyval') {
      const head = ws.getCell(`A${r}`);
      head.value = block.heading;
      head.font = { size: 12, bold: true, color: { argb: 'FF0F1E33' } };
      r += 1;
      if (block.description) {
        const d = ws.getCell(`A${r}`);
        d.value = block.description;
        d.font = { italic: true, color: { argb: 'FF64748B' } };
        r += 1;
      }
      for (const row of block.rows) {
        const lc = ws.getCell(`A${r}`);
        lc.value = row.label;
        lc.font = { bold: true, color: { argb: 'FF334155' } };
        lc.border = THIN_BORDER;
        const vc = ws.getCell(`B${r}`);
        vc.value = row.value === '' ? '—' : coerceNumber(row.value);
        vc.border = THIN_BORDER;
        r += 1;
      }
      r += 1;
    } else if (block.kind === 'matrix') {
      r = renderMatrix(ws, block, r);
      r += 1;
    } else {
      r = renderTable(ws, block, r);
      r += 1;
    }
  }

  if (doc.flags.length > 0) {
    const head = ws.getCell(`A${r}`);
    head.value = 'Flagged for review';
    head.font = { size: 12, bold: true, color: { argb: 'FFB45309' } };
    r += 1;
    for (const f of doc.flags) {
      ws.getCell(`A${r}`).value = f.fieldPath ?? '';
      ws.getCell(`A${r}`).font = { color: { argb: 'FF64748B' } };
      ws.getCell(`B${r}`).value = f.message;
      r += 1;
    }
  }

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 30;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function renderMatrix(ws: ExcelJS.Worksheet, block: MatrixBlock, startRow: number): number {
  const metricsPerGroup = block.metrics.length;
  const firstDataCol = 2; // col 1 is the row-header (Test / Indicator)
  let r = startRow;

  // Header row 1: row-header (merged down two rows) + a merged cell per group.
  const groupRow = r;
  const metricRow = r + 1;
  const rowHeadCell = ws.getCell(groupRow, 1);
  rowHeadCell.value = block.rowHeaderLabel;
  ws.mergeCells(groupRow, 1, metricRow, 1);
  styleHeader(rowHeadCell);

  let col = firstDataCol;
  for (const group of block.columnGroups) {
    const c = ws.getCell(groupRow, col);
    c.value = group.label;
    if (metricsPerGroup > 1) {
      ws.mergeCells(groupRow, col, groupRow, col + metricsPerGroup - 1);
    }
    styleHeader(c);
    // Metric sub-headers under this group.
    for (let i = 0; i < metricsPerGroup; i += 1) {
      const mc = ws.getCell(metricRow, col + i);
      mc.value = block.metrics[i].label;
      styleHeader(mc);
    }
    col += metricsPerGroup;
  }
  r = metricRow + 1;

  // Body rows.
  for (const row of block.rows) {
    const rh = ws.getCell(r, 1);
    rh.value = `${row.srNo}. ${row.label}`;
    rh.font = { bold: true, color: { argb: 'FF334155' } };
    rh.fill = GROUP_FILL;
    rh.border = THIN_BORDER;
    let c = firstDataCol;
    for (const groupCells of row.cells) {
      for (const cell of groupCells) {
        const cc = ws.getCell(r, c);
        cc.border = THIN_BORDER;
        cc.alignment = { horizontal: 'center' };
        if (!cell.enabled) {
          cc.fill = DISABLED_FILL;
          cc.value = null;
        } else {
          cc.value = cell.value === '' ? null : coerceNumber(cell.value);
        }
        c += 1;
      }
    }
    r += 1;
  }

  // Set a readable width on every data column.
  const totalDataCols = block.columnGroups.length * metricsPerGroup;
  for (let i = 0; i < totalDataCols; i += 1) {
    const column = ws.getColumn(firstDataCol + i);
    if (!column.width || column.width < 11) column.width = 11;
  }

  if (block.notes && block.notes.length > 0) {
    for (const note of block.notes) {
      ws.getCell(r, 1).value = note;
      ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
      r += 1;
    }
  }
  return r;
}

function renderTable(ws: ExcelJS.Worksheet, block: TableBlock, startRow: number): number {
  const dimCount = block.dimensions.length;
  const metricsPerGroup = block.metrics.length;
  const firstDataCol = dimCount + 1;
  const groupRow = startRow;
  const metricRow = startRow + 1;

  // Dimension headers: one column each, merged down the two header rows.
  let col = 1;
  for (const dim of block.dimensions) {
    const c = ws.getCell(groupRow, col);
    c.value = dim.label;
    ws.mergeCells(groupRow, col, metricRow, col);
    styleHeader(c);
    col += 1;
  }

  // Group headers + metric sub-headers.
  col = firstDataCol;
  for (const group of block.columnGroups) {
    const c = ws.getCell(groupRow, col);
    c.value = group.label;
    if (metricsPerGroup > 1) {
      ws.mergeCells(groupRow, col, groupRow, col + metricsPerGroup - 1);
    }
    styleHeader(c);
    for (let i = 0; i < metricsPerGroup; i += 1) {
      const mc = ws.getCell(metricRow, col + i);
      mc.value = block.metrics[i].label;
      styleHeader(mc);
    }
    col += metricsPerGroup;
  }

  let r = metricRow + 1;
  for (const row of block.rows) {
    let c = 1;
    for (const dimVal of row.dimensions) {
      const cc = ws.getCell(r, c);
      cc.value = dimVal === '' ? null : coerceNumber(dimVal);
      cc.border = THIN_BORDER;
      c += 1;
    }
    for (const groupCells of row.cells) {
      for (const cell of groupCells) {
        const cc = ws.getCell(r, c);
        cc.border = THIN_BORDER;
        cc.alignment = { horizontal: 'center' };
        cc.value = cell === '' ? null : coerceNumber(cell);
        c += 1;
      }
    }
    r += 1;
  }

  // Auto totals row.
  if (block.totals) {
    const label = ws.getCell(r, 1);
    label.value = 'Total';
    label.font = { bold: true, color: { argb: 'FF334155' } };
    label.fill = GROUP_FILL;
    label.border = THIN_BORDER;
    if (dimCount > 1) ws.mergeCells(r, 1, r, dimCount);
    for (let i = 2; i <= dimCount; i += 1) ws.getCell(r, i).border = THIN_BORDER;
    let c = firstDataCol;
    for (const groupTotals of block.totals) {
      for (const total of groupTotals) {
        const cc = ws.getCell(r, c);
        cc.value = total;
        cc.font = { bold: true };
        cc.fill = GROUP_FILL;
        cc.alignment = { horizontal: 'center' };
        cc.border = THIN_BORDER;
        c += 1;
      }
    }
    r += 1;
  }

  for (let i = 0; i < dimCount; i += 1) {
    const column = ws.getColumn(1 + i);
    if (!column.width || column.width < 16) column.width = 16;
  }
  const totalDataCols = block.columnGroups.length * metricsPerGroup;
  for (let i = 0; i < totalDataCols; i += 1) {
    const column = ws.getColumn(firstDataCol + i);
    if (!column.width || column.width < 11) column.width = 11;
  }

  if (block.notes && block.notes.length > 0) {
    for (const note of block.notes) {
      ws.getCell(r, 1).value = note;
      ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
      r += 1;
    }
  }
  return r;
}

function styleHeader(cell: ExcelJS.Cell): void {
  cell.fill = HEADER_FILL;
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = THIN_BORDER;
}

/** Store numeric-looking values as numbers so Excel can aggregate them. */
function coerceNumber(value: string): string | number {
  if (value === '') return '';
  const n = Number(value);
  return !Number.isNaN(n) && value.trim() !== '' ? n : value;
}
