/**
 * ExcelJS worksheet -> normalized {@link Grid}. Kept separate from the pure
 * parser so the heuristics stay testable without a workbook. The one subtlety
 * here is expanding merged regions: a merged group header (e.g. "By alternative
 * means" spanning three columns) must read as that same caption in every column
 * it covers, so the parser can detect the two-row header. ExcelJS leaves the
 * non-master cells of a merge empty, so we fill them from the master.
 */

import type ExcelJS from 'exceljs';
import type { Grid, GridCell } from './parse';

/** Guardrails so a pathological workbook can't blow up memory/CPU. */
const MAX_ROWS = 500;
const MAX_COLS = 100;

function toGridCell(value: ExcelJS.CellValue): GridCell {
  if (value === null || value === undefined) return { text: '', numeric: null };
  if (typeof value === 'number') return { text: String(value), numeric: value };
  if (typeof value === 'boolean') return { text: value ? 'true' : 'false', numeric: null };
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), numeric: null };
  if (typeof value === 'string') {
    const text = value.trim();
    return { text, numeric: plainNumber(text) };
  }
  // Rich object cell values.
  const obj = value as unknown as Record<string, unknown>;
  if ('result' in obj && obj.result != null) return toGridCell(obj.result as ExcelJS.CellValue);
  if ('richText' in obj && Array.isArray(obj.richText)) {
    const text = (obj.richText as { text?: string }[]).map((r) => r.text ?? '').join('').trim();
    return { text, numeric: plainNumber(text) };
  }
  if ('text' in obj && typeof obj.text === 'string') {
    const text = obj.text.trim();
    return { text, numeric: plainNumber(text) };
  }
  return { text: '', numeric: null };
}

/**
 * Whether a cell is shaded a neutral grey (the convention for a non-applicable
 * matrix cell). Reads the cell's solid fill only — a colour, never a value.
 * Handles both explicit ARGB greys (BFBFBF, A6A6A6, D9D9D9, 808080, …) and the
 * common theme-tint greys ("White, Background 1, Darker 25%" = theme 0 + a
 * negative tint; "Black, Text 1, Lighter …" = theme 1 + a positive tint).
 * Coloured header fills (green/blue/orange) are not neutral, so they're excluded.
 */
function isGreyFill(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill as Partial<ExcelJS.FillPattern> | undefined;
  if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid') return false;
  const fg = fill.fgColor as { argb?: string; theme?: number; tint?: number } | undefined;
  if (!fg) return false;

  if (typeof fg.argb === 'string' && fg.argb.length >= 6) {
    const hex = fg.argb.slice(-6);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const neutral = Math.abs(r - g) <= 18 && Math.abs(g - b) <= 18 && Math.abs(r - b) <= 18;
    // Grey band only: excludes white (~FF) and near-black.
    return neutral && r >= 0x55 && r <= 0xe6;
  }

  if (typeof fg.theme === 'number') {
    const tint = typeof fg.tint === 'number' ? fg.tint : 0;
    if (fg.theme === 0 && tint <= -0.05) return true; // white background, darkened -> grey
    if (fg.theme === 1 && tint >= 0.05) return true; // black text, lightened -> grey
  }
  return false;
}

/** A string is a "plain number" only if it parses cleanly and wholly to one. */
function plainNumber(text: string): number | null {
  if (text === '') return null;
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function extractGrid(ws: ExcelJS.Worksheet): Grid {
  const rowCount = Math.min(ws.rowCount, MAX_ROWS);
  const colCount = Math.min(ws.columnCount, MAX_COLS);
  const grid: Grid = [];
  for (let r = 1; r <= rowCount; r += 1) {
    const row: GridCell[] = [];
    for (let c = 1; c <= colCount; c += 1) {
      const cell = ws.getCell(r, c);
      const gridCell = toGridCell(cell.value);
      if (isGreyFill(cell)) gridCell.disabled = true;
      row.push(gridCell);
    }
    grid.push(row);
  }

  // Expand merged regions: copy the master (top-left) value across the rectangle.
  const merges = (ws.model as { merges?: string[] } | undefined)?.merges;
  if (Array.isArray(merges)) {
    for (const range of merges) {
      const box = parseRange(range);
      if (!box) continue;
      const master = grid[box.top - 1]?.[box.left - 1];
      if (!master || master.text === '') continue;
      for (let r = box.top; r <= box.bottom; r += 1) {
        for (let c = box.left; c <= box.right; c += 1) {
          if (r - 1 >= grid.length || c - 1 >= colCount) continue;
          grid[r - 1][c - 1] = { ...master };
        }
      }
    }
  }
  return grid;
}

function parseRange(range: string): { top: number; left: number; bottom: number; right: number } | null {
  const [a, b] = range.split(':');
  const start = parseA1(a);
  const end = parseA1(b ?? a);
  if (!start || !end) return null;
  return {
    top: Math.min(start.row, end.row),
    bottom: Math.max(start.row, end.row),
    left: Math.min(start.col, end.col),
    right: Math.max(start.col, end.col),
  };
}

function parseA1(ref: string): { row: number; col: number } | null {
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim());
  if (!m) return null;
  const letters = m[1].toUpperCase();
  let col = 0;
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}
