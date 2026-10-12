/**
 * Word (.docx) renderer for a submission export, built on the `docx` library.
 * Mirrors the Excel layout: a title + metadata table, each block (simple
 * key/value sections or the matrix grid with merged grouped headers), then any
 * FLAG outcomes. Disabled matrix cells are shaded so the applicable-metric mask
 * reads the same as on screen.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { ExportDocModel, KeyValueBlock, MatrixBlock, TableBlock } from '../export-model';

const NAVY = '1F3A5F';
const WHITE = 'FFFFFF';
const INK = '0F1E33';
const MUTED = '64748B';
const GROUP_BG = 'EEF2F7';
const DISABLED_BG = 'E2E8F0';

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
};

export async function renderDocx(doc: ExportDocModel): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: doc.title, bold: true, size: 32, color: INK })],
    }),
  );
  if (doc.subtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.subtitle, size: 22, color: MUTED })],
        spacing: { after: 120 },
      }),
    );
  }

  // Metadata table.
  children.push(metaTable(doc));
  children.push(spacer());

  for (const block of doc.blocks) {
    if (block.kind === 'keyval') {
      children.push(...keyvalBlock(block));
    } else if (block.kind === 'matrix') {
      children.push(...matrixBlock(block));
    } else {
      children.push(...tableBlock(block));
    }
    children.push(spacer());
  }

  if (doc.flags.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Flagged for review', bold: true, color: 'B45309' })],
      }),
    );
    for (const f of doc.flags) {
      children.push(
        new Paragraph({
          children: [
            ...(f.fieldPath
              ? [new TextRun({ text: `${f.fieldPath}: `, bold: true, color: MUTED })]
              : []),
            new TextRun({ text: f.message }),
          ],
        }),
      );
    }
  }

  const document = new Document({
    creator: 'OHB Integrated Report System',
    sections: [{ children }],
  });
  return Packer.toBuffer(document);
}

function spacer(): Paragraph {
  return new Paragraph({ children: [], spacing: { after: 120 } });
}

function metaTable(doc: ExportDocModel): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: doc.meta.map(
      (m) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 34, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: GROUP_BG, color: 'auto' },
              children: [
                new Paragraph({ children: [new TextRun({ text: m.label, bold: true, color: '475569' })] }),
              ],
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: m.value })] })],
            }),
          ],
        }),
    ),
  });
}

function keyvalBlock(block: KeyValueBlock): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: block.heading, bold: true, color: INK })],
    }),
  ];
  if (block.description) {
    out.push(
      new Paragraph({ children: [new TextRun({ text: block.description, italics: true, color: MUTED })] }),
    );
  }
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: block.rows.map(
        (row) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: CELL_BORDER,
                shading: { type: ShadingType.CLEAR, fill: GROUP_BG, color: 'auto' },
                children: [
                  new Paragraph({ children: [new TextRun({ text: row.label, bold: true, color: '334155' })] }),
                ],
              }),
              new TableCell({
                borders: CELL_BORDER,
                children: [new Paragraph({ children: [new TextRun({ text: row.value || '—' })] })],
              }),
            ],
          }),
      ),
    }),
  );
  return out;
}

function matrixBlock(block: MatrixBlock): (Paragraph | Table)[] {
  const metricsPerGroup = block.metrics.length;
  const rows: TableRow[] = [];

  // Header row 1: row-header (vertically merged) + group labels spanning metrics.
  const headRow1: TableCell[] = [
    new TableCell({
      rowSpan: 2,
      borders: CELL_BORDER,
      shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
      verticalAlign: VerticalAlign.CENTER,
      children: [headText(block.rowHeaderLabel)],
    }),
  ];
  for (const group of block.columnGroups) {
    headRow1.push(
      new TableCell({
        columnSpan: metricsPerGroup,
        borders: CELL_BORDER,
        shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
        children: [headText(group.label)],
      }),
    );
  }
  rows.push(new TableRow({ tableHeader: true, children: headRow1 }));

  // Header row 2: metric labels repeated under each group.
  const headRow2: TableCell[] = [];
  for (let g = 0; g < block.columnGroups.length; g += 1) {
    for (const metric of block.metrics) {
      headRow2.push(
        new TableCell({
          borders: CELL_BORDER,
          shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
          children: [headText(metric.label)],
        }),
      );
    }
  }
  rows.push(new TableRow({ tableHeader: true, children: headRow2 }));

  // Body.
  for (const row of block.rows) {
    const cells: TableCell[] = [
      new TableCell({
        borders: CELL_BORDER,
        shading: { type: ShadingType.CLEAR, fill: GROUP_BG, color: 'auto' },
        children: [
          new Paragraph({
            children: [new TextRun({ text: `${row.srNo}. ${row.label}`, bold: true, color: '334155' })],
          }),
        ],
      }),
    ];
    for (const groupCells of row.cells) {
      for (const cell of groupCells) {
        cells.push(
          new TableCell({
            borders: CELL_BORDER,
            shading: cell.enabled
              ? undefined
              : { type: ShadingType.CLEAR, fill: DISABLED_BG, color: 'auto' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: cell.enabled ? cell.value || '—' : '' })],
              }),
            ],
          }),
        );
      }
    }
    rows.push(new TableRow({ children: cells }));
  }

  const out: (Paragraph | Table)[] = [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
  ];
  if (block.notes && block.notes.length > 0) {
    for (const note of block.notes) {
      out.push(
        new Paragraph({ children: [new TextRun({ text: note, italics: true, size: 18, color: MUTED })] }),
      );
    }
  }
  return out;
}

function tableBlock(block: TableBlock): (Paragraph | Table)[] {
  const metricsPerGroup = block.metrics.length;
  const rows: TableRow[] = [];

  // Header row 1: dimension headers (merged down two rows) + group labels.
  const headRow1: TableCell[] = block.dimensions.map(
    (dim) =>
      new TableCell({
        rowSpan: 2,
        borders: CELL_BORDER,
        shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
        verticalAlign: VerticalAlign.CENTER,
        children: [headText(dim.label)],
      }),
  );
  for (const group of block.columnGroups) {
    headRow1.push(
      new TableCell({
        columnSpan: metricsPerGroup,
        borders: CELL_BORDER,
        shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
        children: [headText(group.label)],
      }),
    );
  }
  rows.push(new TableRow({ tableHeader: true, children: headRow1 }));

  // Header row 2: metric labels under each group (dimension cells already spanned).
  const headRow2: TableCell[] = [];
  for (let g = 0; g < block.columnGroups.length; g += 1) {
    for (const metric of block.metrics) {
      headRow2.push(
        new TableCell({
          borders: CELL_BORDER,
          shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
          children: [headText(metric.label)],
        }),
      );
    }
  }
  rows.push(new TableRow({ tableHeader: true, children: headRow2 }));

  // Body.
  for (const row of block.rows) {
    const cells: TableCell[] = row.dimensions.map(
      (dimVal) =>
        new TableCell({
          borders: CELL_BORDER,
          shading: { type: ShadingType.CLEAR, fill: GROUP_BG, color: 'auto' },
          children: [new Paragraph({ children: [new TextRun({ text: dimVal || '—', color: '334155' })] })],
        }),
    );
    for (const groupCells of row.cells) {
      for (const cell of groupCells) {
        cells.push(
          new TableCell({
            borders: CELL_BORDER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: cell || '—' })],
              }),
            ],
          }),
        );
      }
    }
    rows.push(new TableRow({ children: cells }));
  }

  const out: (Paragraph | Table)[] = [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
  ];
  if (block.notes && block.notes.length > 0) {
    for (const note of block.notes) {
      out.push(
        new Paragraph({ children: [new TextRun({ text: note, italics: true, size: 18, color: MUTED })] }),
      );
    }
  }
  return out;
}

function headText(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, color: WHITE, size: 18 })],
  });
}
