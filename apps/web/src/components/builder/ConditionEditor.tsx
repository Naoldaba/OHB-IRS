'use client';

/**
 * Recursive editors for the declarative rule AST: a boolean ConditionEditor
 * (ALL/ANY groups of comparisons) and a numeric ExpressionEditor (for
 * CALCULATION rules). Both only ever produce the whitelisted `@ohb/shared` AST —
 * there is no free-text expression or code entry anywhere in the UI.
 */

import { Plus, Trash2, FolderPlus } from 'lucide-react';
import {
  type ComparisonNode,
  type ComparisonOp,
  type ConditionNode,
  type ExprNode,
  type FieldCatalogEntry,
  type Operand,
  isAllNode,
  isAnyNode,
  isConstOperand,
  isExprNode,
  isFieldOperand,
} from '@ohb/shared';
import { Button, Field, Select } from '@/components/ui';
import {
  EXPR_OPS_META,
  LIST_COMPARISON_OPS,
  NAMED_PATTERN_META,
  UNARY_COMPARISON_OPS,
  emptyComparison,
  emptyExpr,
  operatorsForType,
} from './rule-helpers';

type Fields = FieldCatalogEntry[];

function typeOf(fields: Fields, path: string | undefined) {
  return fields.find((f) => f.path === path)?.type;
}

// ---- Condition (boolean) ----------------------------------------------------

export function ConditionEditor({
  node,
  fields,
  readOnly,
  onChange,
  onRemove,
  depth = 0,
}: {
  node: ConditionNode;
  fields: Fields;
  readOnly: boolean;
  onChange: (node: ConditionNode) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const isGroup = isAllNode(node) || isAnyNode(node);

  if (isGroup) {
    const combinator: 'all' | 'any' = isAllNode(node) ? 'all' : 'any';
    const children: ConditionNode[] = isAllNode(node) ? node.all : (node as { any: ConditionNode[] }).any;

    const setChildren = (next: ConditionNode[]) =>
      onChange(combinator === 'all' ? { all: next } : { any: next });
    const setCombinator = (c: 'all' | 'any') =>
      onChange(c === 'all' ? { all: children } : { any: children });

    return (
      <div className="builder-section" style={{ margin: 0, background: depth % 2 ? 'var(--surface)' : 'var(--surface-muted)' }}>
        <div className="row-inline" style={{ marginBottom: 10 }}>
          <Field label="Match">
            <Select
              disabled={readOnly}
              value={combinator}
              onChange={(e) => setCombinator(e.target.value as 'all' | 'any')}
            >
              <option value="all">ALL of these (AND)</option>
              <option value="any">ANY of these (OR)</option>
            </Select>
          </Field>
          <div className="spacer" />
          {!readOnly && onRemove && (
            <Button variant="danger" size="sm" onClick={onRemove}>
              <Trash2 size={14} />
            </Button>
          )}
        </div>

        <div className="stack" style={{ gap: 10 }}>
          {children.length === 0 && <div className="table__empty">No conditions yet.</div>}
          {children.map((child, i) => (
            <ConditionEditor
              key={i}
              node={child}
              fields={fields}
              readOnly={readOnly}
              depth={depth + 1}
              onChange={(next) => setChildren(children.map((c, j) => (j === i ? next : c)))}
              onRemove={() => setChildren(children.filter((_, j) => j !== i))}
            />
          ))}
        </div>

        {!readOnly && (
          <div className="toolbar" style={{ marginTop: 10 }}>
            <Button variant="secondary" size="sm" onClick={() => setChildren([...children, emptyComparison(fields[0]?.path)])}>
              <Plus size={14} /> Add condition
            </Button>
            {depth < 2 && (
              <Button variant="ghost" size="sm" onClick={() => setChildren([...children, { all: [emptyComparison(fields[0]?.path)] }])}>
                <FolderPlus size={14} /> Add group
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Leaf comparison
  return (
    <ComparisonEditor
      node={node as ComparisonNode}
      fields={fields}
      readOnly={readOnly}
      onChange={onChange}
      onRemove={onRemove}
    />
  );
}

function ComparisonEditor({
  node,
  fields,
  readOnly,
  onChange,
  onRemove,
}: {
  node: ComparisonNode;
  fields: Fields;
  readOnly: boolean;
  onChange: (node: ComparisonNode) => void;
  onRemove?: () => void;
}) {
  const leftPath = isFieldOperand(node.left) ? node.left.field : '';
  const leftType = typeOf(fields, leftPath);
  const ops = operatorsForType(leftType);
  const isUnary = UNARY_COMPARISON_OPS.includes(node.op);
  const isList = LIST_COMPARISON_OPS.includes(node.op);
  const isBetween = node.op === 'between';
  const isMatches = node.op === 'matches';

  function setOp(op: ComparisonOp) {
    const next: ComparisonNode = { op, left: node.left };
    if (!UNARY_COMPARISON_OPS.includes(op)) {
      if (op === 'in' || op === 'notIn') next.right = { const: [] };
      else if (op === 'between') next.right = { const: [0, 0] };
      else if (op === 'matches') next.right = { const: 'nonNegativeInteger' };
      else next.right = node.right && !LIST_COMPARISON_OPS.includes(node.op) && node.op !== 'between' ? node.right : { const: '' };
    }
    onChange(next);
  }

  return (
    <div className="row-inline" style={{ alignItems: 'flex-end' }}>
      <Field label="Field">
        <Select
          disabled={readOnly}
          value={leftPath}
          onChange={(e) => onChange({ ...node, left: { field: e.target.value } })}
        >
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

      <Field label="Operator">
        <Select disabled={readOnly} value={node.op} onChange={(e) => setOp(e.target.value as ComparisonOp)}>
          {ops.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      {!isUnary && (
        <RightOperand
          node={node}
          leftType={leftType}
          fields={fields}
          readOnly={readOnly}
          onChange={onChange}
          isList={isList}
          isBetween={isBetween}
          isMatches={isMatches}
        />
      )}

      {!readOnly && onRemove && (
        <Button variant="danger" size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      )}
    </div>
  );
}

function RightOperand({
  node,
  leftType,
  fields,
  readOnly,
  onChange,
  isList,
  isBetween,
  isMatches,
}: {
  node: ComparisonNode;
  leftType: FieldCatalogEntry['type'] | undefined;
  fields: Fields;
  readOnly: boolean;
  onChange: (node: ComparisonNode) => void;
  isList: boolean;
  isBetween: boolean;
  isMatches: boolean;
}) {
  const right = node.right;
  const numericLeft = leftType === 'number' || leftType === 'integer';

  if (isMatches) {
    const val = right && isConstOperand(right) ? String(right.const) : 'nonNegativeInteger';
    return (
      <Field label="Format">
        <Select disabled={readOnly} value={val} onChange={(e) => onChange({ ...node, right: { const: e.target.value } })}>
          {NAMED_PATTERN_META.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (isBetween) {
    const arr = right && isConstOperand(right) && Array.isArray(right.const) ? right.const : [0, 0];
    const set = (i: number, v: string) => {
      const next = [...arr];
      next[i] = v === '' ? 0 : Number(v);
      onChange({ ...node, right: { const: next as (number | string)[] } });
    };
    return (
      <>
        <Field label="Min">
          <input className="input input--inline" type="number" disabled={readOnly} value={String(arr[0] ?? '')} onChange={(e) => set(0, e.target.value)} />
        </Field>
        <Field label="Max">
          <input className="input input--inline" type="number" disabled={readOnly} value={String(arr[1] ?? '')} onChange={(e) => set(1, e.target.value)} />
        </Field>
      </>
    );
  }

  if (isList) {
    const arr = right && isConstOperand(right) && Array.isArray(right.const) ? right.const : [];
    return (
      <Field label="Values (comma-separated)" hint="e.g. yes, no, unknown">
        <input
          className="input"
          disabled={readOnly}
          value={arr.join(', ')}
          onChange={(e) => {
            const parts = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
              .map((s) => (numericLeft && s !== '' && !Number.isNaN(Number(s)) ? Number(s) : s));
            onChange({ ...node, right: { const: parts as (number | string)[] } });
          }}
        />
      </Field>
    );
  }

  // Binary comparison: right is a Field or a Value.
  const rightMode: 'field' | 'const' = right && isFieldOperand(right) ? 'field' : 'const';
  return (
    <>
      <Field label="Compare to">
        <Select
          disabled={readOnly}
          value={rightMode}
          onChange={(e) =>
            onChange({
              ...node,
              right: e.target.value === 'field' ? { field: fields[0]?.path ?? '' } : { const: '' },
            })
          }
        >
          <option value="const">A value</option>
          <option value="field">Another field</option>
        </Select>
      </Field>
      {rightMode === 'field' ? (
        <Field label="Field">
          <Select
            disabled={readOnly}
            value={right && isFieldOperand(right) ? right.field : ''}
            onChange={(e) => onChange({ ...node, right: { field: e.target.value } })}
          >
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
      ) : (
        <Field label="Value">
          <input
            className="input input--inline"
            type={numericLeft ? 'number' : 'text'}
            disabled={readOnly}
            value={right && isConstOperand(right) && right.const !== null && !Array.isArray(right.const) ? String(right.const) : ''}
            onChange={(e) => {
              const raw = e.target.value;
              const value = numericLeft ? (raw === '' ? '' : Number(raw)) : raw;
              onChange({ ...node, right: { const: value } });
            }}
          />
        </Field>
      )}
    </>
  );
}

// ---- Expression (numeric) ---------------------------------------------------

export function ExpressionEditor({
  node,
  fields,
  readOnly,
  onChange,
  depth = 0,
}: {
  node: ExprNode;
  fields: Fields;
  readOnly: boolean;
  onChange: (node: ExprNode) => void;
  depth?: number;
}) {
  const numericFields = fields.filter((f) => f.type === 'number' || f.type === 'integer');
  const args = node.args ?? [];

  const setArgs = (next: (ExprNode | Operand)[]) => onChange({ ...node, args: next });

  return (
    <div className="builder-section" style={{ margin: 0, background: depth % 2 ? 'var(--surface-muted)' : 'var(--surface)' }}>
      <div className="row-inline" style={{ marginBottom: 10 }}>
        <Field label="Operation">
          <Select disabled={readOnly} value={node.op} onChange={(e) => onChange({ ...node, op: e.target.value as ExprNode['op'] })}>
            {EXPR_OPS_META.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        {args.map((arg, i) => (
          <ArgEditor
            key={i}
            arg={arg}
            fields={fields}
            numericFields={numericFields}
            readOnly={readOnly}
            depth={depth}
            onChange={(next) => setArgs(args.map((a, j) => (j === i ? next : a)))}
            onRemove={() => setArgs(args.filter((_, j) => j !== i))}
          />
        ))}
      </div>

      {!readOnly && (
        <div className="toolbar" style={{ marginTop: 10 }}>
          <Button variant="secondary" size="sm" onClick={() => setArgs([...args, { field: numericFields[0]?.path ?? '' }])}>
            <Plus size={14} /> Add field
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setArgs([...args, { const: 0 }])}>
            <Plus size={14} /> Add number
          </Button>
          {depth < 3 && (
            <Button variant="ghost" size="sm" onClick={() => setArgs([...args, emptyExpr(numericFields[0]?.path)])}>
              <FolderPlus size={14} /> Add sub-expression
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ArgEditor({
  arg,
  fields,
  numericFields,
  readOnly,
  onChange,
  onRemove,
  depth,
}: {
  arg: ExprNode | Operand;
  fields: Fields;
  numericFields: Fields;
  readOnly: boolean;
  onChange: (arg: ExprNode | Operand) => void;
  onRemove: () => void;
  depth: number;
}) {
  if (isExprNode(arg)) {
    return (
      <div className="row-inline" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <ExpressionEditor node={arg} fields={fields} readOnly={readOnly} depth={depth + 1} onChange={onChange} />
        </div>
        {!readOnly && (
          <Button variant="danger" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    );
  }

  const mode: 'field' | 'const' = isFieldOperand(arg) ? 'field' : 'const';
  return (
    <div className="row-inline">
      <Field label="Argument">
        <Select
          disabled={readOnly}
          value={mode}
          onChange={(e) => onChange(e.target.value === 'field' ? { field: numericFields[0]?.path ?? '' } : { const: 0 })}
        >
          <option value="field">Field</option>
          <option value="const">Number</option>
        </Select>
      </Field>
      {mode === 'field' ? (
        <Field label="Field">
          <Select disabled={readOnly} value={isFieldOperand(arg) ? arg.field : ''} onChange={(e) => onChange({ field: e.target.value })}>
            <option value="" disabled>
              Select a field…
            </option>
            {numericFields.map((f) => (
              <option key={f.path} value={f.path}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Number">
          <input
            className="input input--inline"
            type="number"
            disabled={readOnly}
            value={isConstOperand(arg) && typeof arg.const === 'number' ? String(arg.const) : ''}
            onChange={(e) => onChange({ const: e.target.value === '' ? 0 : Number(e.target.value) })}
          />
        </Field>
      )}
      {!readOnly && (
        <Button variant="danger" size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      )}
    </div>
  );
}
