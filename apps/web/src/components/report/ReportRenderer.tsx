'use client';

/**
 * The reusable report renderer. It consumes the layout-agnostic RenderModel
 * from @ohb/shared (the same descriptor the server validates against) and draws
 * either a matrix grid or simple sections. One component serves the admin's
 * live builder preview (read mode), the lab data-entry form (edit mode), and
 * read-only review views.
 *
 * Error keys use the shared *validator* path form:
 *   simple: "<sectionKey>.<fieldKey>"
 *   matrix: "<rowKey>.<groupKey>.<metricKey>"   (note: no "rows." prefix)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DocumentRenderModel,
  MatrixRenderModel,
  RenderModel,
  SimpleRenderModel,
  RenderSimpleField,
  TableRenderModel,
  RenderTableDimension,
} from '@ohb/shared';
import { fileTypeLabels } from '@ohb/shared';

type Data = Record<string, unknown>;

export interface ReportRendererProps {
  model: RenderModel;
  data: Data;
  mode: 'edit' | 'read';
  /** validator-path -> message */
  errors?: Record<string, string>;
  onChange?: (next: Data) => void;
}

export function ReportRenderer(props: ReportRendererProps) {
  if (props.model.layout === 'matrix') {
    return <MatrixRenderer {...props} model={props.model} />;
  }
  if (props.model.layout === 'table') {
    return <TableRenderer {...props} model={props.model} />;
  }
  if (props.model.layout === 'document') {
    return <DocumentRenderer model={props.model} />;
  }
  return <SimpleRenderer {...props} model={props.model} />;
}

/* -------------------------------------------------------------------------- */
/* Document (attachment-only)                                                 */
/* -------------------------------------------------------------------------- */

function DocumentRenderer({ model }: { model: DocumentRenderModel }) {
  const types = fileTypeLabels(model.allowedFileTypes);
  return (
    <div className="callout" style={{ alignItems: 'flex-start' }}>
      <div>
        <div className="callout__title">Attachment-only report</div>
        <div className="callout__body">
          {model.instructions ? (
            <p style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{model.instructions}</p>
          ) : (
            <p style={{ margin: '0 0 8px' }}>
              This report is submitted as file attachment(s) — there is no form to fill.
            </p>
          )}
          <p style={{ margin: 0 }} className="text-sm muted">
            Upload your file{model.minAttachments === 1 ? '' : 's'} in the Attachments panel.
            {model.minAttachments > 0
              ? ` At least ${model.minAttachments} file${model.minAttachments === 1 ? '' : 's'} required to submit.`
              : ''}
            {types.length > 0 ? ` Accepted: ${types.join(', ')}.` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Matrix                                                                     */
/* -------------------------------------------------------------------------- */

function MatrixRenderer({
  model,
  data,
  mode,
  errors,
  onChange,
}: ReportRendererProps & { model: MatrixRenderModel }) {
  const rows = (data?.rows ?? {}) as Record<
    string,
    Record<string, Record<string, number | null>>
  >;

  function cellValue(rowKey: string, groupKey: string, metricKey: string): number | null {
    const v = rows?.[rowKey]?.[groupKey]?.[metricKey];
    return typeof v === 'number' ? v : null;
  }

  function setCell(rowKey: string, groupKey: string, metricKey: string, raw: string) {
    if (!onChange) return;
    const parsed = raw === '' ? null : Number(raw);
    const value = raw !== '' && Number.isNaN(parsed) ? null : parsed;
    const next: typeof rows = { ...rows };
    const row = { ...(next[rowKey] ?? {}) };
    const group = { ...(row[groupKey] ?? {}) };
    group[metricKey] = value;
    row[groupKey] = group;
    next[rowKey] = row;
    onChange({ ...data, rows: next });
  }

  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th className="matrix__rowhead" rowSpan={2}>
              Test / Indicator
            </th>
            {model.columnGroups.map((g) => (
              <th key={g.key} colSpan={model.metrics.length}>
                {g.label}
              </th>
            ))}
          </tr>
          <tr>
            {model.columnGroups.map((g) =>
              model.metrics.map((m) => (
                <th key={`${g.key}.${m.key}`}>{m.label}</th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.key}>
              <td className="matrix__rowhead">
                <span className="muted mono">{row.srNo}.</span> {row.label}
              </td>
              {model.columnGroups.map((g) =>
                row.cells[g.key].map((cell) => {
                  if (!cell.enabled) {
                    return (
                      <td key={cell.path} className="cell--disabled" aria-disabled>
                        —
                      </td>
                    );
                  }
                  const errKey = `${row.key}.${g.key}.${cell.metricKey}`;
                  const err = errors?.[errKey];
                  const value = cellValue(row.key, g.key, cell.metricKey);
                  if (mode === 'read') {
                    return (
                      <td key={cell.path}>
                        <span className="cell-value">{value ?? '—'}</span>
                      </td>
                    );
                  }
                  return (
                    <td key={cell.path}>
                      <input
                        id={errKey}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className={`cell-input${err ? ' cell-input--error' : ''}`}
                        value={value ?? ''}
                        title={err ?? undefined}
                        aria-invalid={err ? true : undefined}
                        onChange={(e) => setCell(row.key, g.key, cell.metricKey, e.target.value)}
                      />
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {model.notes && model.notes.length > 0 && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          {model.notes.map((n, i) => (
            <div key={i} className="text-sm muted">
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Table (repeating rows)                                                     */
/* -------------------------------------------------------------------------- */

type TableRow = {
  dimensions: Record<string, string | number | null>;
  cells: Record<string, Record<string, number | null>>;
};

/** A column in visual order: a dimension input, or a group×metric number cell. */
type ColDesc =
  | { kind: 'dim'; label: string; dimKey: string; dim: RenderTableDimension }
  | { kind: 'metric'; label: string; groupKey: string; metricKey: string };

function blankTableRow(model: TableRenderModel): TableRow {
  const dimensions: Record<string, string | number | null> = {};
  for (const d of model.dimensions) dimensions[d.key] = null;
  const cells: Record<string, Record<string, number | null>> = {};
  for (const g of model.columnGroups) {
    const cell: Record<string, number | null> = {};
    for (const m of model.metrics) cell[m.key] = null;
    cells[g.key] = cell;
  }
  return { dimensions, cells };
}

function cloneRow(r: TableRow): TableRow {
  return {
    dimensions: { ...r.dimensions },
    cells: Object.fromEntries(Object.entries(r.cells ?? {}).map(([k, v]) => [k, { ...v }])),
  };
}

/**
 * The repeating-row data table. Edit mode adds spreadsheet conveniences: paste a
 * block from Excel (auto-creating rows), keyboard navigation (Enter / ↑ / ↓),
 * per-column fill-down / clear, and an auto totals row.
 */
function TableRenderer({
  model,
  data,
  mode,
  errors,
  onChange,
}: ReportRendererProps & { model: TableRenderModel }) {
  const rows = (Array.isArray((data as { rows?: unknown })?.rows)
    ? (data as { rows: TableRow[] }).rows
    : []) as TableRow[];

  const wrapRef = useRef<HTMLDivElement>(null);
  const focused = useRef<{ r: number; c: number } | null>(null);
  const [pendingFocus, setPendingFocus] = useState<{ r: number; c: number } | null>(null);
  const [menuCol, setMenuCol] = useState<number | null>(null);

  // Flat column list in visual order: dimensions first, then group × metric.
  const columns = useMemo<ColDesc[]>(() => {
    const out: ColDesc[] = [];
    model.dimensions.forEach((d) => out.push({ kind: 'dim', label: d.label, dimKey: d.key, dim: d }));
    model.columnGroups.forEach((g) =>
      model.metrics.forEach((m) =>
        out.push({ kind: 'metric', label: m.label, groupKey: g.key, metricKey: m.key }),
      ),
    );
    return out;
  }, [model]);

  const commit = (next: TableRow[]) => onChange?.({ ...data, rows: next });

  function colValue(row: TableRow, col: ColDesc): string | number | null {
    return col.kind === 'dim'
      ? row.dimensions?.[col.dimKey] ?? null
      : row.cells?.[col.groupKey]?.[col.metricKey] ?? null;
  }

  /** Apply a batch of (row, column, value) edits, auto-extending the row list. */
  function applyEdits(edits: { r: number; c: number; value: string | number | null }[]) {
    if (!onChange || edits.length === 0) return;
    const maxR = Math.max(rows.length - 1, ...edits.map((e) => e.r));
    const next: TableRow[] = [];
    for (let i = 0; i <= maxR; i += 1) next.push(rows[i] ? cloneRow(rows[i]) : blankTableRow(model));
    for (const e of edits) {
      const col = columns[e.c];
      if (!col) continue;
      if (col.kind === 'dim') next[e.r].dimensions[col.dimKey] = e.value;
      else {
        (next[e.r].cells[col.groupKey] ??= {})[col.metricKey] =
          typeof e.value === 'number' ? e.value : null;
      }
    }
    commit(next);
  }

  const setOne = (r: number, c: number, value: string | number | null) =>
    applyEdits([{ r, c, value }]);
  const addRow = () => commit([...rows, blankTableRow(model)]);
  const removeRow = (i: number) => commit(rows.filter((_, ri) => ri !== i));

  /* ---- keyboard navigation ---- */
  function focusCell(r: number, c: number) {
    const el = wrapRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }
  function moveDown(r: number, c: number) {
    if (r + 1 < rows.length) focusCell(r + 1, c);
    else {
      commit([...rows, blankTableRow(model)]);
      setPendingFocus({ r: r + 1, c });
    }
  }
  function onCellKeyDown(e: React.KeyboardEvent, r: number, c: number, numericNav: boolean) {
    if (e.key === 'Enter') {
      e.preventDefault();
      moveDown(r, c);
    } else if (e.key === 'ArrowDown' && numericNav) {
      e.preventDefault();
      moveDown(r, c);
    } else if (e.key === 'ArrowUp' && numericNav) {
      if (r > 0) {
        e.preventDefault();
        focusCell(r - 1, c);
      }
    }
  }
  useEffect(() => {
    if (pendingFocus) {
      focusCell(pendingFocus.r, pendingFocus.c);
      setPendingFocus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, pendingFocus]);

  /* ---- paste from Excel ---- */
  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text/plain');
    const anchor = focused.current;
    if (!text || !anchor) return;
    const lines = text.replace(/\r/g, '').split('\n');
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (lines.length === 0) return;
    const grid = lines.map((l) => l.split('\t'));
    const multi = grid.length > 1 || (grid[0]?.length ?? 0) > 1;
    if (!multi) return; // a single cell pastes normally
    e.preventDefault();
    const edits: { r: number; c: number; value: string | number | null }[] = [];
    grid.forEach((line, dr) =>
      line.forEach((raw, dc) => {
        const c = anchor.c + dc;
        if (c >= columns.length) return;
        edits.push({ r: anchor.r + dr, c, value: coerceForColumn(columns[c], raw) });
      }),
    );
    applyEdits(edits);
  }

  /* ---- fill down / clear column ---- */
  function fillDown(c: number) {
    setMenuCol(null);
    if (rows.length === 0) return;
    const value = colValue(rows[0], columns[c]);
    applyEdits(rows.map((_, r) => ({ r, c, value })));
  }
  function clearColumn(c: number) {
    setMenuCol(null);
    applyEdits(rows.map((_, r) => ({ r, c, value: null })));
  }
  // Close the column menu on an outside click.
  useEffect(() => {
    if (menuCol === null) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.colmenu')) setMenuCol(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuCol]);

  /* ---- auto totals ---- */
  const totals = useMemo(
    () =>
      columns.map((col) =>
        col.kind === 'metric'
          ? rows.reduce((s, row) => {
              const v = row.cells?.[col.groupKey]?.[col.metricKey];
              return s + (typeof v === 'number' ? v : 0);
            }, 0)
          : null,
      ),
    [columns, rows],
  );
  const showTotals = rows.length > 0 && model.metrics.length > 0;

  const totalCols =
    model.dimensions.length + model.columnGroups.length * model.metrics.length + (mode === 'edit' ? 1 : 0);
  const metricColStart = model.dimensions.length;

  return (
    <div className="matrix-wrap" ref={wrapRef} onPaste={mode === 'edit' ? onPaste : undefined}>
      <table className="matrix">
        <thead>
          <tr>
            {model.dimensions.map((d, di) => (
              <th key={d.key} className="matrix__dim" rowSpan={2}>
                <span className="colhead">
                  <span>
                    {d.label}
                    {d.required && <span style={{ color: 'var(--status-red)' }}> *</span>}
                  </span>
                  {mode === 'edit' && (
                    <ColMenu
                      open={menuCol === di}
                      disabled={rows.length === 0}
                      onToggle={() => setMenuCol(menuCol === di ? null : di)}
                      onFillDown={() => fillDown(di)}
                      onClear={() => clearColumn(di)}
                    />
                  )}
                </span>
              </th>
            ))}
            {model.columnGroups.map((g) => (
              <th key={g.key} colSpan={model.metrics.length}>
                {g.label}
              </th>
            ))}
            {mode === 'edit' && <th rowSpan={2} aria-label="actions" />}
          </tr>
          <tr>
            {model.columnGroups.map((g, gi) =>
              model.metrics.map((m, mi) => {
                const c = metricColStart + gi * model.metrics.length + mi;
                return (
                  <th key={`${g.key}.${m.key}`}>
                    <span className="colhead colhead--center">
                      <span>{m.label}</span>
                      {mode === 'edit' && (
                        <ColMenu
                          open={menuCol === c}
                          disabled={rows.length === 0}
                          onToggle={() => setMenuCol(menuCol === c ? null : c)}
                          onFillDown={() => fillDown(c)}
                          onClear={() => clearColumn(c)}
                        />
                      )}
                    </span>
                  </th>
                );
              }),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {model.dimensions.map((dim, di) => {
                const errKey = `rows[${i}].dimensions.${dim.key}`;
                return (
                  <td key={dim.key} className="matrix__dim">
                    <TableDimControl
                      dim={dim}
                      value={row.dimensions?.[dim.key] ?? null}
                      id={errKey}
                      error={errors?.[errKey]}
                      mode={mode}
                      dataR={i}
                      dataC={di}
                      onFocus={() => (focused.current = { r: i, c: di })}
                      onKeyDown={(e) =>
                        onCellKeyDown(e, i, di, dim.type === 'integer' || dim.type === 'number')
                      }
                      onChange={(v) => setOne(i, di, v)}
                    />
                  </td>
                );
              })}
              {model.columnGroups.map((g, gi) =>
                model.metrics.map((m, mi) => {
                  const c = metricColStart + gi * model.metrics.length + mi;
                  const errKey = `rows[${i}].cells.${g.key}.${m.key}`;
                  const err = errors?.[errKey];
                  const value = row.cells?.[g.key]?.[m.key] ?? null;
                  if (mode === 'read') {
                    return (
                      <td key={`${g.key}.${m.key}`}>
                        <span className="cell-value">{value ?? '—'}</span>
                      </td>
                    );
                  }
                  return (
                    <td key={`${g.key}.${m.key}`}>
                      <input
                        id={errKey}
                        data-r={i}
                        data-c={c}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className={`cell-input${err ? ' cell-input--error' : ''}`}
                        value={value ?? ''}
                        title={err ?? undefined}
                        aria-invalid={err ? true : undefined}
                        onFocus={() => (focused.current = { r: i, c })}
                        onKeyDown={(e) => onCellKeyDown(e, i, c, true)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const parsed = raw === '' ? null : Number(raw);
                          setOne(i, c, raw !== '' && Number.isNaN(parsed) ? null : parsed);
                        }}
                      />
                    </td>
                  );
                }),
              )}
              {mode === 'edit' && (
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    title="Remove this row"
                    onClick={() => removeRow(i)}
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
          {showTotals && (
            <tr className="matrix__total">
              <td className="matrix__dim" colSpan={model.dimensions.length}>
                Total
              </td>
              {columns.slice(metricColStart).map((col, idx) => (
                <td key={idx}>{totals[metricColStart + idx]}</td>
              ))}
              {mode === 'edit' && <td />}
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                No rows yet.{mode === 'edit' ? ' Use “Add row” or paste from Excel to start.' : ''}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {mode === 'edit' && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn--secondary btn--sm" onClick={addRow}>
            + Add row
          </button>
          <span className="text-sm muted" style={{ marginLeft: 10 }}>
            Tip: paste a block from Excel, or press Enter / ↑ ↓ to move between rows.
            {model.minRows > 0 ? ` At least ${model.minRows} row(s) required to submit.` : ''}
          </span>
        </div>
      )}
      {model.notes && model.notes.length > 0 && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          {model.notes.map((n, i) => (
            <div key={i} className="text-sm muted">
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Coerce a pasted string to the right type for a column. */
function coerceForColumn(col: ColDesc, raw: string): string | number | null {
  const s = raw.trim();
  if (s === '') return null;
  if (col.kind === 'metric') {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const t = col.dim.type;
  if (t === 'integer' || t === 'number') {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : s;
  }
  if (t === 'select') {
    const match = col.dim.options?.find(
      (o) => o.label.toLowerCase() === s.toLowerCase() || o.value.toLowerCase() === s.toLowerCase(),
    );
    return match ? match.value : s;
  }
  return s;
}

function ColMenu({
  open,
  disabled,
  onToggle,
  onFillDown,
  onClear,
}: {
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onFillDown: () => void;
  onClear: () => void;
}) {
  return (
    <span className="colmenu">
      <button
        type="button"
        className="colmenu__btn"
        aria-label="Column actions"
        title="Column actions"
        onClick={onToggle}
      >
        ▾
      </button>
      {open && (
        <span className="colmenu__pop" role="menu">
          <button type="button" onClick={onFillDown} disabled={disabled}>
            Fill down
          </button>
          <button type="button" onClick={onClear} disabled={disabled}>
            Clear column
          </button>
        </span>
      )}
    </span>
  );
}

function TableDimControl({
  dim,
  value,
  id,
  error,
  mode,
  dataR,
  dataC,
  onFocus,
  onKeyDown,
  onChange,
}: {
  dim: RenderTableDimension;
  value: string | number | null;
  id: string;
  error?: string;
  mode: 'edit' | 'read';
  dataR: number;
  dataC: number;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onChange: (value: string | number | null) => void;
}) {
  if (mode === 'read') {
    const display =
      dim.type === 'select'
        ? dim.options?.find((o) => o.value === value)?.label ?? (value ?? '—')
        : value ?? '—';
    return <span>{String(display)}</span>;
  }

  const cls = `cell-input${error ? ' cell-input--error' : ''}`;
  const common = {
    id,
    className: cls,
    'data-r': dataR,
    'data-c': dataC,
    title: error ?? undefined,
    'aria-invalid': error ? true : undefined,
    onFocus,
    onKeyDown,
  } as const;

  if (dim.type === 'select') {
    return (
      <select {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {dim.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  const type = dim.type === 'date' ? 'date' : dim.type === 'text' ? 'text' : 'number';
  return (
    <input
      {...common}
      type={type}
      step={dim.type === 'integer' ? 1 : type === 'number' ? 'any' : undefined}
      value={(value as string | number) ?? ''}
      onChange={(e) =>
        onChange(
          type === 'number'
            ? e.target.value === ''
              ? null
              : Number(e.target.value)
            : e.target.value || null,
        )
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Simple                                                                     */
/* -------------------------------------------------------------------------- */

function SimpleRenderer({
  model,
  data,
  mode,
  errors,
  onChange,
}: ReportRendererProps & { model: SimpleRenderModel }) {
  const values = (data?.values ?? {}) as Record<string, unknown>;

  function setValue(key: string, value: unknown) {
    if (!onChange) return;
    onChange({ ...data, values: { ...values, [key]: value } });
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      {model.sections.map((section) => (
        <div key={section.key} className="builder-section">
          <div className="micro-label" style={{ marginBottom: 2 }}>
            {section.label}
          </div>
          {section.description && (
            <div className="text-sm muted" style={{ marginBottom: 12 }}>
              {section.description}
            </div>
          )}
          <div className="grid grid--2">
            {section.fields.map((field) => (
              <SimpleFieldControl
                key={field.path}
                field={field}
                value={values[field.key]}
                error={errors?.[field.path]}
                mode={mode}
                onChange={(v) => setValue(field.key, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SimpleFieldControl({
  field,
  value,
  error,
  mode,
  onChange,
}: {
  field: RenderSimpleField;
  value: unknown;
  error?: string;
  mode: 'edit' | 'read';
  onChange: (value: unknown) => void;
}) {
  const label = (
    <label className="field__label" htmlFor={field.path}>
      {field.label}
      {field.required && <span style={{ color: 'var(--status-red)' }}> *</span>}
    </label>
  );

  if (mode === 'read') {
    const display =
      field.type === 'select'
        ? field.options?.find((o) => o.value === value)?.label ?? (value ?? '—')
        : (value as string | number) ?? '—';
    return (
      <div className="field">
        {label}
        <div className="input" style={{ background: 'var(--surface-muted)' }}>
          {String(display)}
        </div>
      </div>
    );
  }

  let control: React.ReactNode;
  switch (field.type) {
    case 'select':
      control = (
        <select
          id={field.path}
          className="select"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— Select —</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
    case 'integer':
      control = (
        <input
          id={field.path}
          className="input"
          type="number"
          step={field.type === 'integer' ? 1 : 'any'}
          min={field.min}
          max={field.max}
          value={(value as number | string) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
      break;
    case 'date':
      control = (
        <input
          id={field.path}
          className="input"
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
      break;
    default:
      control = (
        <input
          id={field.path}
          className="input"
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className="field">
      {label}
      {control}
      {error ? (
        <div className="field__error">{error}</div>
      ) : field.helpText ? (
        <div className="field__hint">{field.helpText}</div>
      ) : null}
    </div>
  );
}
