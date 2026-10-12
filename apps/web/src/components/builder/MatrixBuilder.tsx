'use client';

/**
 * Structure editor for the `matrix` layout: column groups, metrics, rows and the
 * per-row applicable-metric mask. Keys are lower_snake_case (shared KEY_PATTERN)
 * and double as the stable field path, so renaming a metric key reconciles every
 * row's applicable list to keep references intact.
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  ColumnGroupDef,
  MatrixFieldSchema,
  MetricDef,
  RowDef,
} from '@ohb/shared';
import { Button, Field } from '@/components/ui';
import { slugifyKey } from '@/lib/slug';
import { removeAt, replaceAt } from './schema-helpers';

export function MatrixBuilder({
  schema,
  readOnly,
  onChange,
}: {
  schema: MatrixFieldSchema;
  readOnly: boolean;
  onChange: (schema: MatrixFieldSchema) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  function patch(part: Partial<MatrixFieldSchema>) {
    onChange({ ...schema, ...part });
  }

  /* ---- Column groups ---- */
  function addGroup() {
    const n = schema.columnGroups.length + 1;
    patch({
      columnGroups: [...schema.columnGroups, { key: `group_${n}`, label: `Group ${n}` }],
    });
  }
  function updateGroup(i: number, next: ColumnGroupDef) {
    patch({ columnGroups: replaceAt(schema.columnGroups, i, next) });
  }
  function removeGroup(i: number) {
    patch({ columnGroups: removeAt(schema.columnGroups, i) });
  }

  /* ---- Metrics ---- */
  function addMetric() {
    const n = schema.metrics.length + 1;
    patch({
      metrics: [...schema.metrics, { key: `metric_${n}`, label: `Metric ${n}`, type: 'integer' }],
    });
  }
  function updateMetric(i: number, next: MetricDef) {
    const prev = schema.metrics[i];
    const metrics = replaceAt(schema.metrics, i, next);
    // Reconcile row masks if the metric key changed.
    const rows =
      prev.key !== next.key
        ? schema.rows.map((r) => ({
            ...r,
            applicableMetrics: r.applicableMetrics.map((m) => (m === prev.key ? next.key : m)),
          }))
        : schema.rows;
    patch({ metrics, rows });
  }
  function removeMetric(i: number) {
    const removed = schema.metrics[i];
    patch({
      metrics: removeAt(schema.metrics, i),
      rows: schema.rows.map((r) => ({
        ...r,
        applicableMetrics: r.applicableMetrics.filter((m) => m !== removed.key),
      })),
    });
  }

  /* ---- Rows ---- */
  function addRow() {
    const n = schema.rows.length + 1;
    patch({
      rows: [
        ...schema.rows,
        {
          key: `row_${n}`,
          label: `Row ${n}`,
          srNo: n,
          applicableMetrics: schema.metrics.map((m) => m.key),
        },
      ],
    });
  }
  function updateRow(i: number, next: RowDef) {
    patch({ rows: replaceAt(schema.rows, i, next) });
  }
  function removeRow(i: number) {
    patch({ rows: removeAt(schema.rows, i) });
  }
  function clearRows() {
    patch({ rows: [] });
    setConfirmClear(false);
  }
  function toggleApplicable(rowIndex: number, metricKey: string) {
    const row = schema.rows[rowIndex];
    const has = row.applicableMetrics.includes(metricKey);
    const applicableMetrics = has
      ? row.applicableMetrics.filter((m) => m !== metricKey)
      : [...row.applicableMetrics, metricKey];
    updateRow(rowIndex, { ...row, applicableMetrics });
  }

  return (
    <div>
      {/* Column groups */}
      <div className="builder-section">
        <div className="builder-section__head">
          <h3 className="card__title" style={{ fontSize: 15 }}>
            Column groups
          </h3>
          {!readOnly && (
            <Button variant="secondary" size="sm" onClick={addGroup}>
              <Plus size={14} /> Add group
            </Button>
          )}
        </div>
        <div className="stack">
          {schema.columnGroups.map((g, i) => (
            <KeyLabelRow
              key={i}
              item={g}
              readOnly={readOnly}
              onChange={(next) => updateGroup(i, next)}
              onRemove={schema.columnGroups.length > 1 ? () => removeGroup(i) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="builder-section">
        <div className="builder-section__head">
          <h3 className="card__title" style={{ fontSize: 15 }}>
            Metrics <span className="muted text-sm">(repeated in every column group)</span>
          </h3>
          {!readOnly && (
            <Button variant="secondary" size="sm" onClick={addMetric}>
              <Plus size={14} /> Add metric
            </Button>
          )}
        </div>
        <div className="stack">
          {schema.metrics.map((m, i) => (
            <KeyLabelRow
              key={i}
              item={m}
              readOnly={readOnly}
              onChange={(next) => updateMetric(i, { ...m, ...next })}
              onRemove={schema.metrics.length > 1 ? () => removeMetric(i) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="builder-section">
        <div className="builder-section__head">
          <h3 className="card__title" style={{ fontSize: 15 }}>
            Rows <span className="muted text-sm">(tests / indicators + applicable metrics)</span>
          </h3>
          {!readOnly && (
            <div className="toolbar" style={{ gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={addRow}>
                <Plus size={14} /> Add row
              </Button>
              {schema.rows.length > 0 &&
                (confirmClear ? (
                  <>
                    <span className="text-sm muted">Remove all {schema.rows.length} rows?</span>
                    <Button variant="danger" size="sm" onClick={clearRows}>
                      Yes, remove all
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
                    <Trash2 size={14} /> Remove all rows
                  </Button>
                ))}
            </div>
          )}
        </div>
        {schema.rows.length === 0 ? (
          <div className="table__empty">No rows yet. Add at least one.</div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {schema.rows.map((row, i) => (
              <div key={i} className="builder-section" style={{ margin: 0, background: 'var(--surface-muted)' }}>
                <div className="row-inline" style={{ marginBottom: 10 }}>
                  <Field label="Sr. no">
                    <input
                      className="input input--inline"
                      type="number"
                      min={1}
                      disabled={readOnly}
                      value={row.srNo}
                      onChange={(e) => updateRow(i, { ...row, srNo: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="Row label">
                    <input
                      className="input"
                      disabled={readOnly}
                      value={row.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        const autoKey = slugifyKey(label);
                        updateRow(i, {
                          ...row,
                          label,
                          key: row.key || autoKey,
                        });
                      }}
                    />
                  </Field>
                  <Field label="Key">
                    <input
                      className="input mono"
                      disabled={readOnly}
                      value={row.key}
                      onChange={(e) => updateRow(i, { ...row, key: e.target.value })}
                    />
                  </Field>
                  {!readOnly && (
                    <Button variant="danger" size="sm" onClick={() => removeRow(i)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
                <div className="micro-label" style={{ marginBottom: 6 }}>
                  Applicable metrics
                </div>
                <div className="chip-row">
                  {schema.metrics.map((m) => {
                    const on = row.applicableMetrics.includes(m.key);
                    return (
                      <label
                        key={m.key}
                        className={`pill ${on ? 'pill--green' : 'pill--slate'}`}
                        style={{ cursor: readOnly ? 'default' : 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={readOnly}
                          onChange={() => toggleApplicable(i, m.key)}
                          style={{ margin: 0 }}
                        />
                        {m.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KeyLabelRow({
  item,
  readOnly,
  onChange,
  onRemove,
}: {
  item: { key: string; label: string };
  readOnly: boolean;
  onChange: (next: { key: string; label: string }) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="row-inline">
      <Field label="Label">
        <input
          className="input"
          disabled={readOnly}
          value={item.label}
          onChange={(e) => {
            const label = e.target.value;
            onChange({ label, key: item.key || slugifyKey(label) });
          }}
        />
      </Field>
      <Field label="Key">
        <input
          className="input mono"
          disabled={readOnly}
          value={item.key}
          onChange={(e) => onChange({ ...item, key: e.target.value })}
        />
      </Field>
      {!readOnly && onRemove && (
        <Button variant="danger" size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      )}
    </div>
  );
}
