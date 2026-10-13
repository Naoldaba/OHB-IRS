'use client';

/**
 * The per-rule editor, guided by rule `kind`. It edits a `RuleDraft` and shows a
 * live, plain-language preview plus the shared config-validation errors (the
 * same `validateRules` the server enforces). Raw JSON/code is never shown or
 * accepted — every control maps to a whitelisted AST node.
 */

import { useMemo } from 'react';
import { X } from 'lucide-react';
import {
  BusinessRuleKind,
  buildCatalogMap,
  validateRules,
  type CalculationAction,
  type ConditionalAction,
  type CrossFieldAction,
  type EvaluableRule,
  type ExprNode,
  type FieldCatalogEntry,
  type FieldSchema,
  type ValidationAction,
} from '@ohb/shared';
import { Button, Callout, Card, Field, Input, Pill, Select, Textarea } from '@/components/ui';
import { ConditionEditor, ExpressionEditor } from './ConditionEditor';
import {
  KIND_LABEL,
  SEVERITIES,
  type RuleDraft,
  describeRule,
  draftToEvaluable,
  emptyGroup,
} from './rule-helpers';
import { slugifyKey } from '@/lib/slug';

export function RuleEditor({
  draft,
  fields,
  schema,
  otherRules,
  readOnly,
  saving,
  serverError,
  onChange,
  onSave,
  onCancel,
}: {
  draft: RuleDraft;
  fields: FieldCatalogEntry[];
  schema: FieldSchema;
  otherRules: EvaluableRule[];
  readOnly: boolean;
  saving: boolean;
  serverError?: string | null;
  onChange: (draft: RuleDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const catalog = useMemo(() => buildCatalogMap(schema), [schema]);
  const numericFields = fields.filter((f) => f.type === 'number' || f.type === 'integer');

  const candidate = draftToEvaluable(draft);
  const validation = useMemo(
    () => validateRules(schema, [...otherRules, candidate]),
    [schema, otherRules, candidate],
  );
  // Only surface errors attributable to this rule (or global ones without a key).
  const myErrors = validation.errors.filter((e) => !e.ruleKey || e.ruleKey === draft.key);
  const keyOk = /^[a-z][a-z0-9_]*$/.test(draft.key);
  const canSave = !readOnly && !saving && draft.key.length > 0 && keyOk && draft.name.trim().length > 0 && myErrors.length === 0;

  function setAction(patch: Record<string, unknown>) {
    onChange({ ...draft, action: { ...draft.action, ...patch } });
  }

  return (
    <Card
      title={draft.id ? 'Edit rule' : 'New rule'}
      desc={<span>{KIND_LABEL[draft.kind]}</span>}
      actions={
        <Pill tone="slate">{KIND_LABEL[draft.kind]}</Pill>
      }
    >
      <div className="row-inline">
        <Field label="Name" hint="Shown to reviewers and labs.">
          <Input
            disabled={readOnly}
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              onChange({ ...draft, name, key: draft.id ? draft.key : draft.key || slugifyKey(name) });
            }}
          />
        </Field>
        <Field label="Key" error={!keyOk && draft.key ? 'lower_snake_case' : undefined}>
          <Input
            className="input mono"
            disabled={readOnly || !!draft.id}
            value={draft.key}
            onChange={(e) => onChange({ ...draft, key: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Description (optional)">
        <Textarea
          rows={2}
          disabled={readOnly}
          value={draft.description ?? ''}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </Field>

      {(draft.kind === BusinessRuleKind.VALIDATION || draft.kind === BusinessRuleKind.CROSS_FIELD) && (
        <Field label="Severity">
          <Select
            disabled={readOnly}
            value={draft.severity ?? ''}
            onChange={(e) => onChange({ ...draft, severity: e.target.value as RuleDraft['severity'] })}
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <hr className="divider" />

      {draft.kind === BusinessRuleKind.VALIDATION && (
        <ValidationConfig draft={draft} fields={fields} readOnly={readOnly} onChange={onChange} setAction={setAction} />
      )}

      {draft.kind === BusinessRuleKind.CROSS_FIELD && (
        <>
          <div className="micro-label" style={{ marginBottom: 8 }}>
            The invariant that must hold
          </div>
          <ConditionEditor
            node={draft.condition ?? emptyGroup(fields[0]?.path)}
            fields={fields}
            readOnly={readOnly}
            onChange={(node) => onChange({ ...draft, condition: node })}
          />
          <div style={{ marginTop: 12 }}>
            <Field label="Message when it fails">
              <Input
                disabled={readOnly}
                value={(draft.action as CrossFieldAction).message ?? ''}
                onChange={(e) => setAction({ message: e.target.value })}
                placeholder="e.g. Tested cannot exceed received"
              />
            </Field>
            <Field label="Anchor to field (optional)" hint="Where the message appears in the lab form.">
              <Select
                disabled={readOnly}
                value={(draft.action as CrossFieldAction).targetField ?? ''}
                onChange={(e) => setAction({ targetField: e.target.value || undefined })}
              >
                <option value="">— none —</option>
                {fields.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      )}

      {draft.kind === BusinessRuleKind.CONDITIONAL && (
        <ConditionalConfig draft={draft} fields={fields} readOnly={readOnly} onChange={onChange} setAction={setAction} />
      )}

      {draft.kind === BusinessRuleKind.CALCULATION && (
        <>
          <Field label="Result field (read-only)" hint="Computed server-side; the lab cannot edit it.">
            <Select
              disabled={readOnly}
              value={(draft.action as unknown as CalculationAction).target ?? ''}
              onChange={(e) => setAction({ target: e.target.value })}
            >
              <option value="" disabled>
                Select a numeric field…
              </option>
              {numericFields.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="micro-label" style={{ margin: '8px 0' }}>
            Expression
          </div>
          <ExpressionEditor
            node={(draft.action as unknown as CalculationAction).expr ?? ({ op: 'add', args: [] } as ExprNode)}
            fields={fields}
            readOnly={readOnly}
            onChange={(expr) => setAction({ expr, readOnly: true })}
          />
        </>
      )}

      <hr className="divider" />

      <div className="callout" style={{ marginBottom: 12 }}>
        <div>
          <div className="callout__title">In plain language</div>
          <div className="callout__body">{describeRule(draft, catalog)}</div>
        </div>
      </div>

      {myErrors.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger" title="Fix before saving">
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {myErrors.map((e, i) => (
                <li key={i}>
                  <span className="mono">{e.path}</span> — {e.message}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}
      {serverError && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger" title="Server rejected the rule">
            {serverError}
          </Callout>
        </div>
      )}

      {!readOnly && (
        <div className="toolbar">
          <Button onClick={onSave} disabled={!canSave}>
            {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create rule'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}

function ValidationConfig({
  draft,
  fields,
  readOnly,
  onChange,
  setAction,
}: {
  draft: RuleDraft;
  fields: FieldCatalogEntry[];
  readOnly: boolean;
  onChange: (draft: RuleDraft) => void;
  setAction: (patch: Record<string, unknown>) => void;
}) {
  const a = draft.action as unknown as ValidationAction;
  const numPatch = (key: 'min' | 'max', raw: string) => setAction({ [key]: raw === '' ? undefined : Number(raw) });

  return (
    <>
      <Field label="Field to validate">
        <Select disabled={readOnly} value={a.field ?? ''} onChange={(e) => setAction({ field: e.target.value })}>
          <option value="" disabled>
            Select a field…
          </option>
          {fields.map((f) => (
            <option key={f.path} value={f.path}>
              {f.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="micro-label" style={{ margin: '10px 0 6px' }}>
        Constraints
      </div>
      <label className="checkbox-row">
        <input type="checkbox" disabled={readOnly} checked={a.required === true} onChange={(e) => setAction({ required: e.target.checked || undefined })} />
        <span className="text-sm">Required (must be filled)</span>
      </label>

      <div className="row-inline" style={{ marginTop: 8 }}>
        <Field label="Minimum">
          <input className="input input--inline" type="number" disabled={readOnly} value={a.min ?? ''} onChange={(e) => numPatch('min', e.target.value)} />
        </Field>
        <Field label="Maximum">
          <input className="input input--inline" type="number" disabled={readOnly} value={a.max ?? ''} onChange={(e) => numPatch('max', e.target.value)} />
        </Field>
      </div>

      <Field label="Allowed values (comma-separated, optional)">
        <Input
          disabled={readOnly}
          value={Array.isArray(a.allowedValues) ? a.allowedValues.join(', ') : ''}
          onChange={(e) => {
            const parts = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => (!Number.isNaN(Number(s)) ? Number(s) : s));
            setAction({ allowedValues: parts.length ? (parts as (number | string)[]) : undefined });
          }}
        />
      </Field>

      <Field label="Message (optional)">
        <Input disabled={readOnly} value={a.message ?? ''} onChange={(e) => setAction({ message: e.target.value || undefined })} />
      </Field>

      <hr className="divider" />
      <label className="checkbox-row">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={draft.useCondition === true}
          onChange={(e) => onChange({ ...draft, useCondition: e.target.checked, condition: e.target.checked ? draft.condition ?? emptyGroup(fields[0]?.path) : draft.condition })}
        />
        <span className="text-sm">Only apply when a condition is met</span>
      </label>
      {draft.useCondition && (
        <div style={{ marginTop: 10 }}>
          <ConditionEditor
            node={draft.condition ?? emptyGroup(fields[0]?.path)}
            fields={fields}
            readOnly={readOnly}
            onChange={(node) => onChange({ ...draft, condition: node })}
          />
        </div>
      )}
    </>
  );
}

function ConditionalConfig({
  draft,
  fields,
  readOnly,
  onChange,
  setAction,
}: {
  draft: RuleDraft;
  fields: FieldCatalogEntry[];
  readOnly: boolean;
  onChange: (draft: RuleDraft) => void;
  setAction: (patch: Record<string, unknown>) => void;
}) {
  const a = draft.action as unknown as ConditionalAction;
  const targets = a.targets ?? [];
  const available = fields.filter((f) => !targets.includes(f.path));

  return (
    <>
      <div className="micro-label" style={{ marginBottom: 8 }}>
        When this condition is true…
      </div>
      <ConditionEditor
        node={draft.condition ?? emptyGroup(fields[0]?.path)}
        fields={fields}
        readOnly={readOnly}
        onChange={(node) => onChange({ ...draft, condition: node })}
      />

      <div className="row-inline" style={{ marginTop: 12 }}>
        <Field label="…apply this effect">
          <Select disabled={readOnly} value={a.effect ?? 'require'} onChange={(e) => setAction({ effect: e.target.value })}>
            <option value="require">Require</option>
            <option value="optional">Make optional</option>
            <option value="show">Show</option>
            <option value="hide">Hide</option>
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
          </Select>
        </Field>
      </div>

      <div className="micro-label" style={{ margin: '12px 0 6px' }}>
        To these fields
      </div>
      <div className="chip-row">
        {targets.length === 0 && <span className="text-sm muted">No fields selected yet.</span>}
        {targets.map((t) => (
          <span key={t} className="pill pill--slate">
            {fields.find((f) => f.path === t)?.label ?? t}
            {!readOnly && (
              <button
                type="button"
                className="pill__close"
                aria-label="Remove"
                onClick={() => setAction({ targets: targets.filter((x) => x !== t) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 4, display: 'inline-flex' }}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && available.length > 0 && (
        <div className="row-inline" style={{ marginTop: 8 }}>
          <Field label="Add a target field">
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) setAction({ targets: [...targets, e.target.value] });
              }}
            >
              <option value="">Select a field…</option>
              {available.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </>
  );
}
