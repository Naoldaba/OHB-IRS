/**
 * The declarative Business-Rules DSL (IMPLEMENTATION_PLAN §6.3).
 *
 * Rules are a whitelisted JSON AST — never free-text expressions, JavaScript,
 * SQL, or admin-supplied code. The same types describe what the Rule Builder
 * produces (Phase 6), what is stored in `BusinessRule.condition` / `.action`
 * (jsonb), and what the shared evaluator and config validator consume. Keep the
 * string values stable: they are persisted.
 */

import { BusinessRuleKind, RuleSeverity } from '../../enums';

/** The value-type of a field, used for operator/type compatibility checks. */
export type FieldValueType = 'number' | 'integer' | 'text' | 'date' | 'select';

// ---- Operands ---------------------------------------------------------------

/** A reference to a field by its stable catalog path (e.g. `rows.cd4.alternative.total`). */
export interface FieldOperand {
  field: string;
}
/** A literal constant. Arrays are used by `in`/`notIn` (members) and `between` ([min,max]). */
export interface ConstOperand {
  const: ConstValue;
}
/** A nested numeric expression used as an operand. */
export interface CalcOperand {
  calc: ExprNode;
}
export type Operand = FieldOperand | ConstOperand | CalcOperand;

export type ConstValue =
  | number
  | string
  | boolean
  | null
  | Array<number | string>;

export function isFieldOperand(o: Operand): o is FieldOperand {
  return typeof o === 'object' && o !== null && 'field' in o;
}
export function isConstOperand(o: Operand): o is ConstOperand {
  return typeof o === 'object' && o !== null && 'const' in o;
}
export function isCalcOperand(o: Operand): o is CalcOperand {
  return typeof o === 'object' && o !== null && 'calc' in o;
}

// ---- Expression AST (numeric) ----------------------------------------------

export const EXPR_OPS = ['add', 'sub', 'mul', 'div', 'min', 'max', 'round', 'abs', 'sum'] as const;
export type ExprOp = (typeof EXPR_OPS)[number];

export interface ExprNode {
  op: ExprOp;
  args: Array<ExprNode | Operand>;
}

export function isExprNode(n: ExprNode | Operand): n is ExprNode {
  return typeof n === 'object' && n !== null && 'op' in n && 'args' in n;
}

// ---- Condition AST (boolean) -----------------------------------------------

export const COMPARISON_OPS = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
  'in', 'notIn', 'between',
  'isEmpty', 'isNotEmpty', 'matches',
] as const;
export type ComparisonOp = (typeof COMPARISON_OPS)[number];

/** Unary comparisons take only `left`. */
export const UNARY_OPS: ReadonlySet<ComparisonOp> = new Set(['isEmpty', 'isNotEmpty']);
/** Operators that require numeric (or date) ordering. */
export const ORDERED_OPS: ReadonlySet<ComparisonOp> = new Set(['gt', 'gte', 'lt', 'lte', 'between']);

export interface ComparisonNode {
  op: ComparisonOp;
  left: Operand;
  right?: Operand;
}
export interface AllNode {
  all: ConditionNode[];
}
export interface AnyNode {
  any: ConditionNode[];
}
export interface NotNode {
  not: ConditionNode;
}
export type ConditionNode = ComparisonNode | AllNode | AnyNode | NotNode;

export function isAllNode(n: ConditionNode): n is AllNode {
  return 'all' in n;
}
export function isAnyNode(n: ConditionNode): n is AnyNode {
  return 'any' in n;
}
export function isNotNode(n: ConditionNode): n is NotNode {
  return 'not' in n;
}
export function isComparisonNode(n: ConditionNode): n is ComparisonNode {
  return 'op' in n;
}

// ---- Actions ----------------------------------------------------------------

/** Whitelisted named patterns for `matches` / VALIDATION `format` (no raw regex). */
export const NAMED_PATTERNS = [
  'integer',
  'nonNegativeInteger',
  'decimal',
  'nonNegativeDecimal',
] as const;
export type NamedPattern = (typeof NAMED_PATTERNS)[number];

/** VALIDATION — a single-field constraint. Emits a diagnostic at the rule severity. */
export interface ValidationAction {
  field: string;
  required?: boolean;
  min?: number;
  max?: number;
  allowedValues?: Array<number | string>;
  format?: NamedPattern;
  /** Optional message override; otherwise a default per-constraint message is used. */
  message?: string;
}

/** CROSS_FIELD — the rule `condition` is the invariant that must hold. */
export interface CrossFieldAction {
  message?: string;
  /** Optional field the diagnostic is anchored to in the UI. */
  targetField?: string;
}

export const CONDITIONAL_EFFECTS = ['show', 'hide', 'require', 'optional', 'enable', 'disable'] as const;
export type ConditionalEffect = (typeof CONDITIONAL_EFFECTS)[number];

/** CONDITIONAL — when `condition` is true, apply `effect` to `targets`. */
export interface ConditionalAction {
  effect: ConditionalEffect;
  targets: string[];
}

/** CALCULATION — compute `expr` and write it into `target` (read-only field). */
export interface CalculationAction {
  target: string;
  expr: ExprNode;
  readOnly?: boolean;
}

export type RuleAction =
  | ValidationAction
  | CrossFieldAction
  | ConditionalAction
  | CalculationAction;

/**
 * A rule as consumed by the evaluator / validator: a pure-data subset of the
 * persisted `BusinessRule`. `condition` and `action` are the JSON ASTs above.
 */
export interface EvaluableRule {
  key: string;
  name?: string;
  kind: BusinessRuleKind;
  severity?: RuleSeverity | null;
  condition?: ConditionNode | null;
  action: RuleAction;
  enabled?: boolean;
  order?: number;
}
