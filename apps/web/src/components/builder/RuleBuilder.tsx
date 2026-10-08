'use client';

/**
 * The rule-authoring half of the Report Builder (Phase 6). It lists a version's
 * business rules, drives the per-kind RuleEditor, applies parameterised
 * templates, and runs the dry-run test panel — all against the shared evaluator
 * and the `rules` / `validate` / `test` API endpoints. Rules are editable only
 * while the version is a DRAFT (the server enforces this too).
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, FlaskConical, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import {
  buildCatalogMap,
  type Diagnostic,
  type EvaluableRule,
  type FieldCatalogEntry,
  type FieldEffect,
  type FieldSchema,
} from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { BusinessRuleRow } from '@/lib/types';
import { Button, Callout, Card, Field, Pill, Select, Spinner, Textarea } from '@/components/ui';
import { RuleEditor } from './RuleEditor';
import {
  KIND_LABEL,
  RULE_KINDS,
  RULE_TEMPLATES,
  type RuleDraft,
  type RuleTemplate,
  describeRule,
  draftToEvaluable,
  newRuleDraft,
  rowToDraft,
  severityTone,
} from './rule-helpers';

interface TestResponse {
  config: { ok: boolean; errors: { ruleKey?: string; path: string; message: string }[] };
  calculated: Record<string, unknown>;
  effects: Record<string, FieldEffect>;
  diagnostics: Diagnostic[];
  flags: Diagnostic[];
}

function rowToEvaluable(row: BusinessRuleRow): EvaluableRule {
  const condition =
    row.condition && Object.keys(row.condition).length > 0
      ? (row.condition as unknown as EvaluableRule['condition'])
      : null;
  return {
    key: row.key,
    name: row.name,
    kind: row.kind as EvaluableRule['kind'],
    severity: (row.severity as EvaluableRule['severity']) ?? null,
    condition,
    action: row.action as EvaluableRule['action'],
    enabled: row.enabled,
    order: row.order,
  };
}

export function RuleBuilder({
  reportTypeId,
  versionId,
  schema,
  readOnly,
}: {
  reportTypeId: string;
  versionId: string;
  schema: FieldSchema;
  readOnly: boolean;
}) {
  const base = `/report-types/${reportTypeId}/definition-versions/${versionId}`;
  const [fields, setFields] = useState<FieldCatalogEntry[] | null>(null);
  const [rules, setRules] = useState<BusinessRuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const catalog = useMemo(() => buildCatalogMap(schema), [schema]);

  const load = useCallback(async () => {
    const [f, r] = await Promise.all([
      api.get<FieldCatalogEntry[]>(`${base}/fields`),
      api.get<BusinessRuleRow[]>(`${base}/rules`),
    ]);
    setFields(f);
    setRules(r);
  }, [base]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load rules'));
  }, [load]);

  const otherRules = useMemo<EvaluableRule[]>(
    () => (rules ?? []).filter((r) => r.id !== editing?.id).map(rowToEvaluable),
    [rules, editing?.id],
  );

  async function save() {
    if (!editing) return;
    setSaving(true);
    setServerError(null);
    const evaluable = draftToEvaluable(editing);
    const payload = {
      key: editing.key,
      name: editing.name,
      description: editing.description || undefined,
      kind: editing.kind,
      severity: evaluable.severity ?? undefined,
      // `{}` is stored (and read back) as "no condition"; always send it so an
      // update reliably clears a previously-set condition.
      condition: (evaluable.condition ?? {}) as Record<string, unknown>,
      action: editing.action,
      enabled: editing.enabled,
    };
    try {
      if (editing.id) {
        await api.patch(`${base}/rules/${editing.id}`, payload);
      } else {
        await api.post(`${base}/rules`, { ...payload, templateId: editing.templateId });
      }
      await load();
      setEditing(null);
    } catch (err) {
      setServerError(formatError(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: BusinessRuleRow) {
    if (!confirm(`Delete rule “${row.name}”? This cannot be undone.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await api.del(`${base}/rules/${row.id}`);
      await load();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleEnabled(row: BusinessRuleRow) {
    setBusyId(row.id);
    try {
      await api.patch(`${base}/rules/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rules) return;
    const target = index + dir;
    if (target < 0 || target >= rules.length) return;
    const a = rules[index];
    const b = rules[target];
    setBusyId(a.id);
    try {
      await Promise.all([
        api.patch(`${base}/rules/${a.id}`, { order: b.order }),
        api.patch(`${base}/rules/${b.id}`, { order: a.order }),
      ]);
      await load();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (error && !rules) return <Callout tone="danger" title="Could not load rules">{error}</Callout>;
  if (!fields || !rules)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  if (editing) {
    return (
      <RuleEditor
        draft={editing}
        fields={fields}
        schema={schema}
        otherRules={otherRules}
        readOnly={readOnly}
        saving={saving}
        serverError={serverError}
        onChange={setEditing}
        onSave={save}
        onCancel={() => {
          setEditing(null);
          setServerError(null);
        }}
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <Callout tone="danger">{error}</Callout>}

      <Card
        title="Business rules"
        desc="Validation, cross-field checks, conditional behaviour, and calculations — evaluated by the shared engine. The backend is authoritative."
        actions={
          !readOnly && (
            <Button variant="secondary" size="sm" onClick={() => setShowTemplates((s) => !s)}>
              <Wand2 size={14} /> {showTemplates ? 'Hide templates' : 'From template'}
            </Button>
          )
        }
      >
        {showTemplates && !readOnly && (
          <TemplateLibrary
            fields={fields}
            onApply={(draft) => {
              setShowTemplates(false);
              setServerError(null);
              setEditing(draft);
            }}
          />
        )}

        {rules.length === 0 ? (
          <div className="table__empty">No rules yet. Add one below or start from a template.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th>Rule</th>
                <th>Kind</th>
                <th>Severity</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((row, i) => {
                const draft = rowToDraft(row, fields[0]?.path);
                return (
                  <tr key={row.id} style={{ opacity: row.enabled ? 1 : 0.55 }}>
                    <td>
                      {!readOnly && (
                        <div className="stack" style={{ gap: 2 }}>
                          <button className="icon-btn" aria-label="Move up" disabled={i === 0 || busyId === row.id} onClick={() => move(i, -1)} style={iconBtn}>
                            <ArrowUp size={13} />
                          </button>
                          <button className="icon-btn" aria-label="Move down" disabled={i === rules.length - 1 || busyId === row.id} onClick={() => move(i, 1)} style={iconBtn}>
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div className="text-sm muted">{describeRule(draft, catalog)}</div>
                      <div className="mono" style={{ marginTop: 2 }}>{row.key}</div>
                    </td>
                    <td className="text-sm">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td>{row.severity ? <Pill tone={severityTone(row.severity)}>{row.severity.toLowerCase()}</Pill> : <span className="muted">—</span>}</td>
                    <td>
                      <Pill tone={row.enabled ? 'green' : 'slate'}>{row.enabled ? 'enabled' : 'disabled'}</Pill>
                    </td>
                    <td>
                      <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                        {readOnly ? (
                          <Button variant="ghost" size="sm" onClick={() => setEditing(draft)}>
                            <Pencil size={14} /> View
                          </Button>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" disabled={busyId === row.id} onClick={() => toggleEnabled(row)}>
                              {row.enabled ? 'Disable' : 'Enable'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => { setServerError(null); setEditing(draft); }}>
                              <Pencil size={14} /> Edit
                            </Button>
                            <Button variant="danger" size="sm" disabled={busyId === row.id} onClick={() => remove(row)}>
                              <Trash2 size={14} />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!readOnly && (
          <div style={{ marginTop: 16 }}>
            <div className="micro-label" style={{ marginBottom: 8 }}>
              Add a rule
            </div>
            <div className="grid grid--2">
              {RULE_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  className="callout"
                  style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                  onClick={() => {
                    setServerError(null);
                    setEditing(newRuleDraft(k.value, fields[0]?.path));
                  }}
                >
                  <Plus className="callout__icon" size={18} />
                  <div>
                    <div className="callout__title">{k.label}</div>
                    <div className="callout__body">{k.blurb}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <TestPanel base={base} fields={fields} catalog={catalog} />
    </div>
  );
}

const iconBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 20,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  cursor: 'pointer',
  color: 'var(--text-muted)',
};

// ---- Templates --------------------------------------------------------------

function TemplateLibrary({
  fields,
  onApply,
}: {
  fields: FieldCatalogEntry[];
  onApply: (draft: RuleDraft) => void;
}) {
  const [active, setActive] = useState<RuleTemplate | null>(null);
  return (
    <div className="builder-section" style={{ background: 'var(--surface-muted)' }}>
      <div className="micro-label" style={{ marginBottom: 10 }}>
        Template library
      </div>
      {!active ? (
        <div className="grid grid--2">
          {RULE_TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="callout" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setActive(t)}>
              <Wand2 className="callout__icon" size={18} />
              <div>
                <div className="callout__title">{t.name}</div>
                <div className="callout__body">
                  {t.description} <span className="muted">· {KIND_LABEL[t.kind]}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <TemplateApply template={active} fields={fields} onCancel={() => setActive(null)} onApply={onApply} />
      )}
    </div>
  );
}

function TemplateApply({
  template,
  fields,
  onCancel,
  onApply,
}: {
  template: RuleTemplate;
  fields: FieldCatalogEntry[];
  onCancel: () => void;
  onApply: (draft: RuleDraft) => void;
}) {
  const numericFields = fields.filter((f) => f.type === 'number' || f.type === 'integer');
  const initial = Object.fromEntries(
    template.params.map((p) => [p.key, p.kind === 'number' ? '' : (p.kind === 'numericField' ? numericFields[0]?.path ?? '' : fields[0]?.path ?? '')]),
  );
  const [params, setParams] = useState<Record<string, string>>(initial);

  const complete = template.params.every((p) => params[p.key] !== undefined && params[p.key] !== '');

  function apply() {
    const built = template.build(params);
    onApply({
      id: undefined,
      key: built.key,
      name: built.name,
      description: built.description ?? '',
      kind: built.kind ?? template.kind,
      severity: built.severity,
      condition: built.condition ?? null,
      useCondition: built.useCondition,
      action: built.action ?? {},
      enabled: true,
      templateId: template.id,
    });
  }

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{template.name}</div>
      <div className="text-sm muted" style={{ marginBottom: 12 }}>
        {template.description}
      </div>
      <div className="row-inline">
        {template.params.map((p) => {
          const opts = p.kind === 'numericField' ? numericFields : fields;
          return (
            <Field key={p.key} label={p.label} hint={p.hint}>
              {p.kind === 'number' ? (
                <input className="input input--inline" type="number" value={params[p.key] ?? ''} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} />
              ) : (
                <Select value={params[p.key] ?? ''} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })}>
                  <option value="" disabled>
                    Select a field…
                  </option>
                  {opts.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          );
        })}
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <Button size="sm" onClick={apply} disabled={!complete}>
          Use template
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Back
        </Button>
      </div>
    </div>
  );
}

// ---- Test panel -------------------------------------------------------------

function TestPanel({
  base,
  fields,
  catalog,
}: {
  base: string;
  fields: FieldCatalogEntry[];
  catalog: Map<string, FieldCatalogEntry>;
}) {
  const [text, setText] = useState('{\n  \n}');
  const [result, setResult] = useState<TestResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setErr(null);
    setResult(null);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      setErr('Sample data must be valid JSON.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<TestResponse>(`${base}/test`, { data });
      setResult(res);
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  const label = (path?: string) => (path ? catalog.get(path)?.label ?? path : '');

  return (
    <Card
      title="Test against sample data"
      desc="Dry-run the saved rules against sample submission data. Nothing is persisted."
      actions={
        <Button size="sm" onClick={run} disabled={busy}>
          <FlaskConical size={14} /> {busy ? 'Running…' : 'Run test'}
        </Button>
      }
    >
      <Field label="Sample submission data (JSON)" hint="Mirrors a submission's data object — matrix cells nest under rows.<row>.<group>.<metric>; simple fields under values.<field>.">
        <Textarea rows={8} className="textarea mono" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>

      {err && (
        <div style={{ marginTop: 12 }}>
          <Callout tone="danger">{err}</Callout>
        </div>
      )}

      {result && (
        <div className="stack" style={{ marginTop: 12, gap: 12 }}>
          {!result.config.ok && (
            <Callout tone="danger" title="Rule configuration errors">
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {result.config.errors.map((e, i) => (
                  <li key={i}>
                    {e.ruleKey ? <span className="mono">{e.ruleKey}: </span> : null}
                    <span className="mono">{e.path}</span> — {e.message}
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          <div>
            <div className="micro-label" style={{ marginBottom: 6 }}>
              Diagnostics
            </div>
            {result.diagnostics.length === 0 ? (
              <div className="text-sm muted">No diagnostics — the data passes every rule.</div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {result.diagnostics.map((d, i) => (
                  <div key={i} className="row-inline" style={{ alignItems: 'center' }}>
                    <Pill tone={severityTone(d.severity)}>{d.severity.toLowerCase()}</Pill>
                    <span className="text-sm">
                      {d.fieldPath ? <span className="muted">{label(d.fieldPath)}: </span> : null}
                      {d.message} <span className="mono">({d.ruleKey})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {Object.keys(result.calculated).length > 0 && (
            <div>
              <div className="micro-label" style={{ marginBottom: 6 }}>
                Calculated values
              </div>
              <div className="stack" style={{ gap: 4 }}>
                {Object.entries(result.calculated).map(([path, value]) => (
                  <div key={path} className="text-sm">
                    <span className="muted">{label(path)}:</span> <strong>{value === null ? '—' : String(value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(result.effects).length > 0 && (
            <div>
              <div className="micro-label" style={{ marginBottom: 6 }}>
                Conditional effects
              </div>
              <div className="stack" style={{ gap: 4 }}>
                {Object.entries(result.effects).map(([path, eff]) => (
                  <div key={path} className="text-sm">
                    <span className="muted">{label(path)}:</span>{' '}
                    {[
                      eff.visible === false ? 'hidden' : eff.visible === true ? 'shown' : null,
                      eff.required === true ? 'required' : eff.required === false ? 'optional' : null,
                      eff.enabled === false ? 'disabled' : eff.enabled === true ? 'enabled' : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    const fieldErrs = err.fieldErrors;
    if (fieldErrs.length) return `${err.message}: ${fieldErrs.map((e) => `${e.path} ${e.message}`).join('; ')}`;
    const body = err.body as { errors?: { path: string; message: string }[] } | null;
    if (body?.errors?.length) return body.errors.map((e) => `${e.path} ${e.message}`).join('; ');
    return err.message;
  }
  return 'Something went wrong';
}
