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

import type {
  MatrixRenderModel,
  RenderModel,
  SimpleRenderModel,
  RenderSimpleField,
  TableRenderModel,
  RenderTableDimension,
} from '@ohb/shared';

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
  return <SimpleRenderer {...props} model={props.model} />;
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

  const commit = (next: TableRow[]) => onChange?.({ ...data, rows: next });

  function setDim(i: number, key: string, value: string | number | null) {
    const next = rows.map((r, ri) =>
      ri === i ? { ...r, dimensions: { ...r.dimensions, [key]: value } } : r,
    );
    commit(next);
  }
  function setCell(i: number, groupKey: string, metricKey: string, raw: string) {
    const parsed = raw === '' ? null : Number(raw);
    const value = raw !== '' && Number.isNaN(parsed) ? null : parsed;
    const next = rows.map((r, ri) => {
      if (ri !== i) return r;
      const group = { ...(r.cells[groupKey] ?? {}), [metricKey]: value };
      return { ...r, cells: { ...r.cells, [groupKey]: group } };
    });
    commit(next);
  }
  function addRow() {
    commit([...rows, blankTableRow(model)]);
  }
  function removeRow(i: number) {
    commit(rows.filter((_, ri) => ri !== i));
  }

  const totalCols =
    model.dimensions.length + model.columnGroups.length * model.metrics.length + (mode === 'edit' ? 1 : 0);

  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            {model.dimensions.map((d) => (
              <th key={d.key} className="matrix__rowhead" rowSpan={2}>
                {d.label}
                {d.required && <span style={{ color: 'var(--status-red)' }}> *</span>}
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
            {model.columnGroups.map((g) =>
              model.metrics.map((m) => <th key={`${g.key}.${m.key}`}>{m.label}</th>),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {model.dimensions.map((dim) => {
                const errKey = `rows[${i}].dimensions.${dim.key}`;
                return (
                  <td key={dim.key} className="matrix__rowhead" style={{ textAlign: 'left' }}>
                    <TableDimControl
                      dim={dim}
                      value={row.dimensions?.[dim.key] ?? null}
                      id={errKey}
                      error={errors?.[errKey]}
                      mode={mode}
                      onChange={(v) => setDim(i, dim.key, v)}
                    />
                  </td>
                );
              })}
              {model.columnGroups.map((g) =>
                model.metrics.map((m) => {
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
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className={`cell-input${err ? ' cell-input--error' : ''}`}
                        value={value ?? ''}
                        title={err ?? undefined}
                        aria-invalid={err ? true : undefined}
                        onChange={(e) => setCell(i, g.key, m.key, e.target.value)}
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
          {rows.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                No rows yet.{mode === 'edit' ? ' Use “Add row” to start entering data.' : ''}
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
          {model.minRows > 0 && (
            <span className="text-sm muted" style={{ marginLeft: 10 }}>
              At least {model.minRows} row(s) required to submit.
            </span>
          )}
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

function TableDimControl({
  dim,
  value,
  id,
  error,
  mode,
  onChange,
}: {
  dim: RenderTableDimension;
  value: string | number | null;
  id: string;
  error?: string;
  mode: 'edit' | 'read';
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
  if (dim.type === 'select') {
    return (
      <select
        id={id}
        className={cls}
        value={(value as string) ?? ''}
        title={error ?? undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      >
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
      id={id}
      className={cls}
      type={type}
      step={dim.type === 'integer' ? 1 : type === 'number' ? 'any' : undefined}
      value={(value as string | number) ?? ''}
      title={error ?? undefined}
      aria-invalid={error ? true : undefined}
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
