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
