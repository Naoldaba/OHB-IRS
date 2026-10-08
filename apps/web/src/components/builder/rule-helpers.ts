/**
 * Authoring helpers for the Rule Builder (Phase 6). These shape the declarative
 * rule AST (`@ohb/shared`) that the admin produces through the UI — the builder
 * never accepts raw JSON, code, SQL, or free-text expressions. The server
 * re-validates everything with the same shared `validateRules`; these helpers
 * only make the UI convenient and give a human-readable preview of each rule.
 */

import {
  BusinessRuleKind,
  RuleSeverity,
  type CalculationAction,
  type ComparisonNode,
  type ComparisonOp,
  type ConditionalAction,
  type ConditionalEffect,
  type ConditionNode,
  type CrossFieldAction,
  type EvaluableRule,
  type ExprNode,
  type ExprOp,
  type FieldCatalogEntry,
  type FieldValueType,
  type NamedPattern,
  type Operand,
  type ValidationAction,
  isAllNode,
  isAnyNode,
  isComparisonNode,
  isConstOperand,
  isExprNode,
  isFieldOperand,
  isNotNode,
} from '@ohb/shared';

// ---- Kinds ------------------------------------------------------------------

export const RULE_KINDS: {
  value: BusinessRuleKind;
  label: string;
  blurb: string;
}[] = [
  {
    value: BusinessRuleKind.VALIDATION,
    label: 'Field validation',
    blurb: 'Constrain a single field (required, min/max, allowed values, format).',
  },
  {
    value: BusinessRuleKind.CROSS_FIELD,
    label: 'Cross-field check',
    blurb: 'An invariant across fields that must hold (e.g. tested ≤ received).',
  },
  {
    value: BusinessRuleKind.CONDITIONAL,
    label: 'Conditional behaviour',
    blurb: 'Show / hide / require fields when a condition is met.',
  },
  {
    value: BusinessRuleKind.CALCULATION,
    label: 'Calculated field',
    blurb: 'Compute a read-only field from other fields.',
  },
];

export const KIND_LABEL: Record<string, string> = Object.fromEntries(
  RULE_KINDS.map((k) => [k.value, k.label]),
);

// ---- Severities -------------------------------------------------------------

export const SEVERITIES: { value: RuleSeverity; label: string; blurb: string }[] = [
  { value: RuleSeverity.ERROR, label: 'Error — blocks submission', blurb: 'The lab cannot submit until it is fixed.' },
  { value: RuleSeverity.WARNING, label: 'Warning — advisory', blurb: 'Shown to the lab but does not block submission.' },
  { value: RuleSeverity.FLAG, label: 'Flag — for bureau review', blurb: 'Advisory, and recorded on the submission for reviewers.' },
  { value: RuleSeverity.INFO, label: 'Info', blurb: 'Informational note only.' },
];

export function severityTone(sev?: string | null): 'green' | 'amber' | 'red' | 'slate' {
  switch (sev) {
    case RuleSeverity.ERROR:
      return 'red';
    case RuleSeverity.WARNING:
    case RuleSeverity.FLAG:
      return 'amber';
    default:
      return 'slate';
  }
}

// ---- Operators --------------------------------------------------------------

const OP_LABELS: Record<ComparisonOp, string> = {
  eq: 'is equal to',
  ne: 'is not equal to',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  in: 'is one of',
  notIn: 'is not one of',
  between: 'is between',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  matches: 'matches the format',
};

const OP_SYMBOL: Partial<Record<ComparisonOp, string>> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

const NUMERIC_OPS: ComparisonOp[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'];
const TEXT_OPS: ComparisonOp[] = ['eq', 'ne', 'in', 'notIn', 'isEmpty', 'isNotEmpty', 'matches'];
const SELECT_OPS: ComparisonOp[] = ['eq', 'ne', 'in', 'notIn', 'isEmpty', 'isNotEmpty'];

/** Operators offered for a field of the given value type. */
export function operatorsForType(type: FieldValueType | undefined): { value: ComparisonOp; label: string }[] {
  let ops: ComparisonOp[];
  switch (type) {
    case 'number':
    case 'integer':
    case 'date':
      ops = NUMERIC_OPS;
      break;
    case 'select':
      ops = SELECT_OPS;
      break;
    case 'text':
    default:
      ops = type === undefined ? (['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'between', 'isEmpty', 'isNotEmpty', 'matches'] as ComparisonOp[]) : TEXT_OPS;
  }
  return ops.map((value) => ({ value, label: OP_LABELS[value] }));
}

export const UNARY_COMPARISON_OPS: ComparisonOp[] = ['isEmpty', 'isNotEmpty'];
export const LIST_COMPARISON_OPS: ComparisonOp[] = ['in', 'notIn'];

export const EXPR_OPS_META: { value: ExprOp; label: string }[] = [
  { value: 'add', label: 'Add (+)' },
  { value: 'sub', label: 'Subtract (−)' },
  { value: 'mul', label: 'Multiply (×)' },
  { value: 'div', label: 'Divide (÷)' },
  { value: 'sum', label: 'Sum of all' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'round', label: 'Round' },
  { value: 'abs', label: 'Absolute value' },
];

export const EFFECTS_META: { value: ConditionalEffect; label: string }[] = [
  { value: 'require', label: 'Require' },
  { value: 'optional', label: 'Make optional' },
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
  { value: 'enable', label: 'Enable' },
  { value: 'disable', label: 'Disable' },
];

export const NAMED_PATTERN_META: { value: NamedPattern; label: string }[] = [
  { value: 'nonNegativeInteger', label: 'Non-negative whole number' },
  { value: 'integer', label: 'Whole number' },
  { value: 'nonNegativeDecimal', label: 'Non-negative number' },
  { value: 'decimal', label: 'Number (decimal)' },
];

// ---- The editable draft -----------------------------------------------------

export interface RuleDraft {
  id?: string;
  key: string;
  name: string;
  description?: string;
  kind: BusinessRuleKind;
  severity?: RuleSeverity;
  /** Normalised to a group node (all/any) in the editor; null = no condition. */
  condition: ConditionNode | null;
  action: Record<string, unknown>;
  enabled: boolean;
  order?: number;
  /** Whether a VALIDATION rule is gated by an optional condition. */
  useCondition?: boolean;
  templateId?: string;
}

/** A fresh comparison leaf, defaulting its left side to the first field. */
export function emptyComparison(firstField?: string): ComparisonNode {
  return { op: 'eq', left: { field: firstField ?? '' }, right: { const: '' } };
}

/** The condition always normalises to an ALL/ANY group in the editor. */
export function emptyGroup(firstField?: string): ConditionNode {
  return { all: [emptyComparison(firstField)] };
}

/** Wrap a persisted condition for editing (bare comparisons become groups). */
export function normaliseCondition(node: ConditionNode | null | undefined, firstField?: string): ConditionNode | null {
  if (!node) return null;
  if (isAllNode(node) || isAnyNode(node)) return node;
  return { all: [node] };
}

export function emptyExpr(firstField?: string): ExprNode {
  return { op: 'add', args: [{ field: firstField ?? '' }, { const: 0 }] };
}

export function newRuleDraft(kind: BusinessRuleKind, firstField?: string): RuleDraft {
  const base = {
    id: undefined,
    key: '',
    name: '',
    description: '',
    enabled: true,
  };
  switch (kind) {
    case BusinessRuleKind.VALIDATION:
      return {
        ...base,
        kind,
        severity: RuleSeverity.ERROR,
        condition: null,
        useCondition: false,
        action: { field: firstField ?? '', required: true },
      };
    case BusinessRuleKind.CROSS_FIELD:
      return {
        ...base,
        kind,
        severity: RuleSeverity.ERROR,
        condition: emptyGroup(firstField),
        action: {},
      };
    case BusinessRuleKind.CONDITIONAL:
      return {
        ...base,
        kind,
        severity: undefined,
        condition: emptyGroup(firstField),
        action: { effect: 'require', targets: [] as string[] },
      };
    case BusinessRuleKind.CALCULATION:
      return {
        ...base,
        kind,
        severity: undefined,
        condition: null,
        action: { target: firstField ?? '', expr: emptyExpr(firstField), readOnly: true },
      };
  }
}

/** Build the evaluable/persistable shape from a draft (drops editor-only fields). */
export function draftToEvaluable(draft: RuleDraft): EvaluableRule {
  const severityRequired =
    draft.kind === BusinessRuleKind.VALIDATION || draft.kind === BusinessRuleKind.CROSS_FIELD;
  const condition =
    draft.kind === BusinessRuleKind.VALIDATION
      ? draft.useCondition
        ? draft.condition
        : null
      : draft.condition;
  return {
    key: draft.key,
    name: draft.name,
    kind: draft.kind,
    severity: severityRequired ? draft.severity ?? null : null,
    condition: condition ?? null,
    action: draft.action as EvaluableRule['action'],
    enabled: draft.enabled,
    order: draft.order,
  };
}

/** Map a persisted rule row into an editable draft. */
export function rowToDraft(row: {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  kind: string;
  severity?: string | null;
  condition?: Record<string, unknown> | null;
  action: Record<string, unknown>;
  enabled: boolean;
  order: number;
}, firstField?: string): RuleDraft {
  const kind = row.kind as BusinessRuleKind;
  const rawCond = row.condition && Object.keys(row.condition).length > 0 ? (row.condition as unknown as ConditionNode) : null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description ?? '',
    kind,
    severity: (row.severity as RuleSeverity) ?? undefined,
    condition: normaliseCondition(rawCond, firstField),
    useCondition: kind === BusinessRuleKind.VALIDATION ? rawCond != null : undefined,
    action: row.action ?? {},
    enabled: row.enabled,
    order: row.order,
  };
}

// ---- Human-readable preview -------------------------------------------------

export function labelFor(catalog: Map<string, FieldCatalogEntry>, path: string): string {
  return catalog.get(path)?.label ?? path ?? '(field)';
}

function describeOperand(op: Operand | undefined, catalog: Map<string, FieldCatalogEntry>): string {
  if (!op) return '?';
  if (isFieldOperand(op)) return `“${labelFor(catalog, op.field)}”`;
  if (isConstOperand(op)) {
    const v = op.const;
    if (Array.isArray(v)) return `[${v.join(', ')}]`;
    if (v === '' || v === null || v === undefined) return '(empty)';
    return String(v);
  }
  const calc = (op as { calc?: ExprNode }).calc;
  return calc ? describeExpr(calc, catalog) : '?';
}

export function describeCondition(node: ConditionNode | null, catalog: Map<string, FieldCatalogEntry>): string {
  if (!node) return '';
  if (isAllNode(node)) return node.all.map((n) => describeCondition(n, catalog)).filter(Boolean).join(' AND ') || '(empty)';
  if (isAnyNode(node)) return node.any.map((n) => describeCondition(n, catalog)).filter(Boolean).join(' OR ') || '(empty)';
  if (isNotNode(node)) return `NOT (${describeCondition(node.not, catalog)})`;
  if (isComparisonNode(node)) {
    const left = describeOperand(node.left, catalog);
    if (node.op === 'isEmpty') return `${left} is empty`;
    if (node.op === 'isNotEmpty') return `${left} is not empty`;
    const sym = OP_SYMBOL[node.op];
    const right = describeOperand(node.right, catalog);
    return sym ? `${left} ${sym} ${right}` : `${left} ${OP_LABELS[node.op]} ${right}`;
  }
  return '';
}

export function describeExpr(node: ExprNode | Operand, catalog: Map<string, FieldCatalogEntry>): string {
  if (!isExprNode(node)) return describeOperand(node, catalog);
  const parts = node.args.map((a) => describeExpr(a, catalog));
  switch (node.op) {
    case 'add':
      return `(${parts.join(' + ')})`;
    case 'sub':
      return `(${parts.join(' − ')})`;
    case 'mul':
      return `(${parts.join(' × ')})`;
    case 'div':
      return `(${parts.join(' ÷ ')})`;
    case 'sum':
      return `sum(${parts.join(', ')})`;
    case 'min':
      return `min(${parts.join(', ')})`;
    case 'max':
      return `max(${parts.join(', ')})`;
    case 'round':
      return `round(${parts.join(', ')})`;
    case 'abs':
      return `abs(${parts.join(', ')})`;
    default:
      return `${node.op}(${parts.join(', ')})`;
  }
}

/** A one-line, plain-language summary of what a rule does. */
export function describeRule(draft: RuleDraft, catalog: Map<string, FieldCatalogEntry>): string {
  switch (draft.kind) {
    case BusinessRuleKind.VALIDATION: {
      const a = draft.action as unknown as ValidationAction;
      const field = `“${labelFor(catalog, a.field)}”`;
      const parts: string[] = [];
      if (a.required) parts.push('is required');
      if (typeof a.min === 'number' && typeof a.max === 'number') parts.push(`is between ${a.min} and ${a.max}`);
      else {
        if (typeof a.min === 'number') parts.push(`is at least ${a.min}`);
        if (typeof a.max === 'number') parts.push(`is at most ${a.max}`);
      }
      if (Array.isArray(a.allowedValues)) parts.push(`is one of [${a.allowedValues.join(', ')}]`);
      if (a.format) parts.push(`is a ${NAMED_PATTERN_META.find((p) => p.value === a.format)?.label.toLowerCase() ?? a.format}`);
      const gate = draft.useCondition && draft.condition ? `When ${describeCondition(draft.condition, catalog)}, ` : '';
      return `${gate}${field} ${parts.join(' and ') || '(no constraint)'}.`;
    }
    case BusinessRuleKind.CROSS_FIELD: {
      const a = draft.action as unknown as CrossFieldAction;
      const inv = describeCondition(draft.condition, catalog) || '(no condition)';
      const msg = a.message ? ` Otherwise: “${a.message}”.` : '';
      return `Require that ${inv}.${msg}`;
    }
    case BusinessRuleKind.CONDITIONAL: {
      const a = draft.action as unknown as ConditionalAction;
      const effect = EFFECTS_META.find((e) => e.value === a.effect)?.label.toLowerCase() ?? a.effect;
      const targets = (a.targets ?? []).map((t) => `“${labelFor(catalog, t)}”`).join(', ') || '(no fields)';
      return `When ${describeCondition(draft.condition, catalog) || '(no condition)'}, ${effect} ${targets}.`;
    }
    case BusinessRuleKind.CALCULATION: {
      const a = draft.action as unknown as CalculationAction;
      return `“${labelFor(catalog, a.target)}” = ${a.expr ? describeExpr(a.expr, catalog) : '(no expression)'} (read-only).`;
    }
    default:
      return '';
  }
}

// ---- Template library -------------------------------------------------------

export interface TemplateParam {
  key: string;
  label: string;
  kind: 'field' | 'number' | 'numericField';
  hint?: string;
}

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  kind: BusinessRuleKind;
  params: TemplateParam[];
  /** Build a draft from the bound params (fields are catalog paths). */
  build: (p: Record<string, string>) => Partial<RuleDraft> & { name: string; key: string };
}

const slugSuffix = () => Math.random().toString(36).slice(2, 6);

/**
 * A curated, parameterisable template library. Applying one instantiates a
 * concrete `BusinessRule` (via the normal create endpoint) with real field
 * bindings — the plan's "template library + apply/parameterize", no backend
 * template store required for the first builder.
 */
export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'required',
    name: 'Field is required',
    description: 'The lab must fill a field before submitting.',
    kind: BusinessRuleKind.VALIDATION,
    params: [{ key: 'field', label: 'Field', kind: 'field' }],
    build: (p) => ({
      kind: BusinessRuleKind.VALIDATION,
      key: `required_${slugSuffix()}`,
      name: 'Required field',
      severity: RuleSeverity.ERROR,
      condition: null,
      useCondition: false,
      action: { field: p.field, required: true },
    }),
  },
  {
    id: 'non_negative_integer',
    name: 'Non-negative whole number',
    description: 'A field must be a whole number of zero or more.',
    kind: BusinessRuleKind.VALIDATION,
    params: [{ key: 'field', label: 'Field', kind: 'field' }],
    build: (p) => ({
      kind: BusinessRuleKind.VALIDATION,
      key: `nonneg_${slugSuffix()}`,
      name: 'Non-negative whole number',
      severity: RuleSeverity.ERROR,
      condition: null,
      useCondition: false,
      action: { field: p.field, min: 0, format: 'nonNegativeInteger' },
    }),
  },
  {
    id: 'within_range',
    name: 'Value within a range',
    description: 'A numeric field must fall between a minimum and maximum.',
    kind: BusinessRuleKind.VALIDATION,
    params: [
      { key: 'field', label: 'Field', kind: 'numericField' },
      { key: 'min', label: 'Minimum', kind: 'number' },
      { key: 'max', label: 'Maximum', kind: 'number' },
    ],
    build: (p) => ({
      kind: BusinessRuleKind.VALIDATION,
      key: `range_${slugSuffix()}`,
      name: 'Value within range',
      severity: RuleSeverity.ERROR,
      condition: null,
      useCondition: false,
      action: { field: p.field, min: Number(p.min), max: Number(p.max) },
    }),
  },
  {
    id: 'lte_other',
    name: 'One field must be ≤ another',
    description: 'Cross-field invariant, e.g. tested ≤ received, positive ≤ total.',
    kind: BusinessRuleKind.CROSS_FIELD,
    params: [
      { key: 'left', label: 'This field', kind: 'numericField' },
      { key: 'right', label: 'must be ≤ this field', kind: 'numericField' },
    ],
    build: (p) => ({
      kind: BusinessRuleKind.CROSS_FIELD,
      key: `lte_${slugSuffix()}`,
      name: 'Must not exceed',
      severity: RuleSeverity.ERROR,
      condition: { all: [{ op: 'lte', left: { field: p.left }, right: { field: p.right } }] },
      action: { message: 'This value cannot exceed the related field.', targetField: p.left },
    }),
  },
  {
    id: 'flag_gt_other',
    name: 'Flag when a field exceeds another',
    description: 'Non-blocking flag for bureau review when one field is greater than another.',
    kind: BusinessRuleKind.CROSS_FIELD,
    params: [
      { key: 'left', label: 'Flag when this field', kind: 'numericField' },
      { key: 'right', label: 'exceeds this field', kind: 'numericField' },
    ],
    build: (p) => ({
      kind: BusinessRuleKind.CROSS_FIELD,
      key: `flag_${slugSuffix()}`,
      name: 'Review flag',
      severity: RuleSeverity.FLAG,
      // The invariant that must hold is "left <= right"; when it fails, a FLAG is raised.
      condition: { all: [{ op: 'lte', left: { field: p.left }, right: { field: p.right } }] },
      action: { message: 'Flagged for review: value exceeds the related field.', targetField: p.left },
    }),
  },
  {
    id: 'calc_sum',
    name: 'Calculated total = A + B',
    description: 'Compute a read-only field as the sum of two other fields.',
    kind: BusinessRuleKind.CALCULATION,
    params: [
      { key: 'target', label: 'Result field', kind: 'numericField' },
      { key: 'a', label: 'First field', kind: 'numericField' },
      { key: 'b', label: 'Second field', kind: 'numericField' },
    ],
    build: (p) => ({
      kind: BusinessRuleKind.CALCULATION,
      key: `calc_${slugSuffix()}`,
      name: 'Calculated total',
      condition: null,
      action: { target: p.target, expr: { op: 'add', args: [{ field: p.a }, { field: p.b }] }, readOnly: true },
    }),
  },
  {
    id: 'require_when_filled',
    name: 'Require a field when another is filled',
    description: 'Make a field required only when a trigger field has a value.',
    kind: BusinessRuleKind.CONDITIONAL,
    params: [
      { key: 'trigger', label: 'When this field is filled', kind: 'field' },
      { key: 'target', label: 'require this field', kind: 'field' },
    ],
    build: (p) => ({
      kind: BusinessRuleKind.CONDITIONAL,
      key: `cond_${slugSuffix()}`,
      name: 'Conditionally required',
      condition: { all: [{ op: 'isNotEmpty', left: { field: p.trigger } }] },
      action: { effect: 'require', targets: [p.target] },
    }),
  },
];
