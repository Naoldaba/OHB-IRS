/**
 * PDF renderer for a submission export, built on pdfkit. pdfkit has no table
 * primitive, so this draws cells manually: a title + metadata list, each block
 * (simple key/value sections or the matrix grid with grouped headers), then any
 * FLAG outcomes. Tables repeat their header after a page break, and disabled
 * matrix cells are shaded so the applicable-metric mask reads the same as on
 * screen. A document that contains a matrix is laid out in landscape so the
 * grouped columns fit.
 */

import PDFDocument from 'pdfkit';
import type { ExportDocModel, KeyValueBlock, MatrixBlock } from '../export-model';

const NAVY = '#1F3A5F';
const WHITE = '#FFFFFF';
const INK = '#0F1E33';
const MUTED = '#64748B';
const BORDER = '#CBD5E1';
const GROUP_BG = '#EEF2F7';
const DISABLED_BG = '#E2E8F0';
const AMBER = '#B45309';

const PAD = 4;

type Doc = PDFKit.PDFDocument;

interface CellOpts {
  fill?: string;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  fontSize?: number;
}

export function renderPdf(doc: ExportDocModel): Promise<Buffer> {
  const hasMatrix = doc.blocks.some((b) => b.kind === 'matrix');
  const pdf = new PDFDocument({
    size: 'A4',
    layout: hasMatrix ? 'landscape' : 'portrait',
    margin: 40,
    info: { Title: doc.title, Author: 'OHB Integrated Report System' },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  const left = pdf.page.margins.left;
  const contentW = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;

  // Title + subtitle.
  pdf.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(doc.title, left, pdf.y);
  if (doc.subtitle) {
    pdf.moveDown(0.2);
    pdf.fillColor(MUTED).font('Helvetica').fontSize(11).text(doc.subtitle, left, pdf.y);
  }
  pdf.moveDown(0.6);

  // Metadata list.
  pdf.fontSize(10);
  for (const m of doc.meta) {
    const y = pdf.y;
    pdf.font('Helvetica-Bold').fillColor('#475569').text(m.label, left, y, { width: 150, continued: false });
    pdf.font('Helvetica').fillColor(INK).text(m.value, left + 155, y, { width: contentW - 155 });
  }
  pdf.moveDown(0.8);

  for (const block of doc.blocks) {
    ensureSpace(pdf, 60);
    if (block.kind === 'keyval') {
      drawKeyVal(pdf, block, left, contentW);
    } else {
      drawMatrix(pdf, block, left, contentW);
    }
    pdf.moveDown(0.8);
  }

  if (doc.flags.length > 0) {
    ensureSpace(pdf, 40);
    pdf.font('Helvetica-Bold').fillColor(AMBER).fontSize(12).text('Flagged for review', left, pdf.y);
    pdf.moveDown(0.3);
    pdf.fontSize(10);
    for (const f of doc.flags) {
      const y = pdf.y;
      if (f.fieldPath) {
        pdf.font('Helvetica-Bold').fillColor(MUTED).text(`${f.fieldPath}: `, left, y, { continued: true });
      }
      pdf.font('Helvetica').fillColor(INK).text(f.message, { width: contentW });
    }
  }

  pdf.end();
  return done;
}

function bottom(pdf: Doc): number {
  return pdf.page.height - pdf.page.margins.bottom;
}

function ensureSpace(pdf: Doc, needed: number): void {
  if (pdf.y + needed > bottom(pdf)) pdf.addPage();
}

/** Draw a single bordered cell with optional fill and centered-ish text. */
function cell(pdf: Doc, x: number, y: number, w: number, h: number, text: string, opts: CellOpts = {}): void {
  if (opts.fill) {
    pdf.rect(x, y, w, h).fill(opts.fill);
  }
  pdf.lineWidth(0.5).strokeColor(BORDER).rect(x, y, w, h).stroke();
  if (text !== '') {
    pdf
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.fontSize ?? 9)
      .fillColor(opts.color ?? INK);
    const th = pdf.heightOfString(text, { width: w - PAD * 2, align: opts.align ?? 'left' });
    const ty = y + Math.max(PAD, (h - th) / 2);
    pdf.text(text, x + PAD, ty, { width: w - PAD * 2, align: opts.align ?? 'left', lineBreak: true });
  }
}

function drawKeyVal(pdf: Doc, block: KeyValueBlock, left: number, contentW: number): void {
  pdf.font('Helvetica-Bold').fillColor(INK).fontSize(12).text(block.heading, left, pdf.y);
  if (block.description) {
    pdf.font('Helvetica-Oblique').fillColor(MUTED).fontSize(9).text(block.description, left, pdf.y);
  }
  pdf.moveDown(0.3);

  const labelW = Math.min(220, contentW * 0.45);
  const valueW = contentW - labelW;

  for (const row of block.rows) {
    const value = row.value || '—';
    pdf.fontSize(9);
    const lh = pdf.heightOfString(row.label, { width: labelW - PAD * 2 });
    const vh = pdf.heightOfString(value, { width: valueW - PAD * 2 });
    const h = Math.max(lh, vh) + PAD * 2;
    if (pdf.y + h > bottom(pdf)) pdf.addPage();
    const y = pdf.y;
    cell(pdf, left, y, labelW, h, row.label, { fill: GROUP_BG, bold: true, color: '#334155' });
    cell(pdf, left + labelW, y, valueW, h, value, {});
    pdf.y = y + h;
  }
}

function drawMatrix(pdf: Doc, block: MatrixBlock, left: number, contentW: number): void {
  const metricsPerGroup = block.metrics.length;
  const dataCols = block.columnGroups.length * metricsPerGroup;
  const rowHeadW = Math.min(170, contentW * 0.26);
  const colW = (contentW - rowHeadW) / dataCols;
  const groupW = colW * metricsPerGroup;

  const h1 = 20; // group header height
  const h2 = 30; // metric header height
  const rowH = 20;

  const drawHeader = () => {
    const y = pdf.y;
    cell(pdf, left, y, rowHeadW, h1 + h2, block.rowHeaderLabel, {
      fill: NAVY,
      color: WHITE,
      bold: true,
      align: 'left',
      fontSize: 9,
    });
    let x = left + rowHeadW;
    for (const group of block.columnGroups) {
      cell(pdf, x, y, groupW, h1, group.label, { fill: NAVY, color: WHITE, bold: true, align: 'center' });
      for (let i = 0; i < metricsPerGroup; i += 1) {
        cell(pdf, x + i * colW, y + h1, colW, h2, block.metrics[i].label, {
          fill: NAVY,
          color: WHITE,
          bold: true,
          align: 'center',
          fontSize: 7,
        });
      }
      x += groupW;
    }
    pdf.y = y + h1 + h2;
  };

  drawHeader();

  for (const row of block.rows) {
    if (pdf.y + rowH > bottom(pdf)) {
      pdf.addPage();
      drawHeader();
    }
    const y = pdf.y;
    cell(pdf, left, y, rowHeadW, rowH, `${row.srNo}. ${row.label}`, {
      fill: GROUP_BG,
      bold: true,
      color: '#334155',
      fontSize: 8,
    });
    let x = left + rowHeadW;
    for (const groupCells of row.cells) {
      for (const c of groupCells) {
        cell(pdf, x, y, colW, rowH, c.enabled ? c.value : '', {
          fill: c.enabled ? undefined : DISABLED_BG,
          align: 'center',
        });
        x += colW;
      }
    }
    pdf.y = y + rowH;
  }

  if (block.notes && block.notes.length > 0) {
    pdf.moveDown(0.3);
    for (const note of block.notes) {
      pdf.font('Helvetica-Oblique').fillColor(MUTED).fontSize(8).text(note, left, pdf.y, { width: contentW });
    }
  }
}
