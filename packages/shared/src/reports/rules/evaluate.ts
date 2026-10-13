/**
 * The shared, pure Business-Rules evaluator (IMPLEMENTATION_PLAN §6.4).
 *
 * Identical logic runs on the client (immediate UX feedback) and the server
 * (the authority). It is side-effect free and only interprets the whitelisted
 * AST — there is no `eval`, no dynamic code, no I/O.
 *
 *   evaluate(schema, rules, data) -> { values, calculated, effects, diagnostics, flags }
 *
 * Defined semantics (explicit, not assumed):
 *   - Missing values: an absent/null operand makes arithmetic yield `null`;
 *     comparisons against `null` are `false` except `isEmpty`/`isNotEmpty`.
 *   - Safe division: `div` by `0` or `null` yields `null` and attaches an INFO
 *     diagnostic rather than throwing.
 *   - Calculations run in dependency (topological) order; a cycle is rejected at
 *     config/publish time (see validate-rules), never here — if one somehow
 *     reaches evaluation, a single best-effort pass is made instead of looping.
 *   - CROSS_FIELD invariants are skipped when any field they reference is empty,
 *     so incomplete drafts are not penalised for not-yet-entered values.
 *   - Enforcement mapping is the caller's: ERROR blocks submission; WARNING/INFO
 *     are advisory; FLAG is advisory and recorded in `submission.flags`.
 */

import { BusinessRuleKind, RuleSeverity } from '../../enums';
import { FieldSchema } from '../field-schema';
import {
  buildCatalogMap,
  FieldCatalogEntry,
  getAtDataPath,
  setAtDataPath,
} from './field-catalog';
import {
  CalculationAction,
  ComparisonNode,
  ConditionalAction,
  ConditionNode,
  CrossFieldAction,
  EvaluableRule,
  ExprNode,
  isAllNode,
  isAnyNode,
  isComparisonNode,
  isConstOperand,
  isExprNode,
  isFieldOperand,
  isNotNode,
  NamedPattern,
  Operand,
  ValidationAction,
} from './rule-ast';

export interface Diagnostic {
  ruleKey: string;
  severity: RuleSeverity;
  fieldPath?: string;
  message: string;
}

export interface FieldEffect {
  visible?: boolean;
  required?: boolean;
  enabled?: boolean;
}

export interface EvaluationResult {
  /** The submission data with calculated fields written in (for persistence). */
  values: Record<string, unknown>;
  /** Just the calculated fields: path -> computed value. */
  calculated: Record<string, unknown>;
  /** Conditional effects: field path -> visibility/required/enabled overrides. */
  effects: Record<string, FieldEffect>;
  diagnostics: Diagnostic[];
  /** The FLAG-severity subset of diagnostics (recorded on the submission). */
  flags: Diagnostic[];
}

const NAMED_PATTERNS: Record<NamedPattern, RegExp> = {
  integer: /^-?\d+$/,
  nonNegativeInteger: /^\d+$/,
  decimal: /^-?\d+(\.\d+)?$/,
  nonNegativeDecimal: /^\d+(\.\d+)?$/,
};

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function toNumber(value: unknown): number | null {
  if (isEmpty(value) || typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}

function jsonClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function evaluate(
  schema: FieldSchema,
  rules: EvaluableRule[],
  data: unknown,
): EvaluationResult {
  const catalog = buildCatalogMap(schema);
  const working: Record<string, unknown> =
    data && typeof data === 'object' && !Array.isArray(data)
      ? jsonClone(data as Record<string, unknown>)
      : {};

  const diagnostics: Diagnostic[] = [];
  const calculated: Record<string, unknown> = {};
  const effects: Record<string, FieldEffect> = {};

  const resolve = (path: string): unknown => {
    const entry = catalog.get(path);
    return entry ? getAtDataPath(working, entry.dataPath) : undefined;
  };

  const enabled = rules.filter((r) => r.enabled !== false);

  // 1) CALCULATIONS, in dependency order, writing results back into `working`
  //    so later calculations can read earlier ones.
  const calcRules = enabled.filter((r) => r.kind === BusinessRuleKind.CALCULATION);
  for (const rule of orderCalculations(calcRules)) {
    const action = rule.action as CalculationAction;
    const entry = catalog.get(action.target);
    if (!entry) continue; // unknown target (config validation catches this earlier)
    const value = evalExpr(action.expr, resolve, diagnostics, rule.key);
    setAtDataPath(working, entry.dataPath, value);
    calculated[action.target] = value;
  }

  // 2) CONDITIONAL effects (applied in rule order; later rules win per field).
  const condRules = enabled
    .filter((r) => r.kind === BusinessRuleKind.CONDITIONAL)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const rule of condRules) {
    const holds = rule.condition ? evalCondition(rule.condition, resolve, diagnostics, rule.key) : true;
    if (!holds) continue;
    const action = rule.action as ConditionalAction;
    for (const target of action.targets ?? []) {
      const eff = effects[target] ?? (effects[target] = {});
      applyEffect(eff, action.effect);
    }
  }

  // 3) VALIDATION — single-field constraints.
  for (const rule of enabled.filter((r) => r.kind === BusinessRuleKind.VALIDATION)) {
    // An optional condition gates when the validation applies.
    if (rule.condition && !evalCondition(rule.condition, resolve, diagnostics, rule.key)) continue;
    evalValidation(rule, resolve, diagnostics);
  }

  // 4) CROSS_FIELD — the condition is the invariant that must hold.
  for (const rule of enabled.filter((r) => r.kind === BusinessRuleKind.CROSS_FIELD)) {
    if (!rule.condition) continue;
    // Skip when any referenced field is empty (don't penalise incomplete data).
    const refs = collectFieldRefs(rule.condition);
    if (refs.some((p) => isEmpty(resolve(p)))) continue;
    const holds = evalCondition(rule.condition, resolve, diagnostics, rule.key);
    if (!holds) {
      const action = (rule.action ?? {}) as CrossFieldAction;
      diagnostics.push({
        ruleKey: rule.key,
        severity: rule.severity ?? RuleSeverity.ERROR,
        fieldPath: action.targetField,
        message: action.message ?? rule.name ?? 'Cross-field check failed',
      });
    }
  }

  const flags = diagnostics.filter((d) => d.severity === RuleSeverity.FLAG);
  return { values: working, calculated, effects, diagnostics, flags };
}

// ---- Effects ----------------------------------------------------------------

function applyEffect(eff: FieldEffect, effect: ConditionalAction['effect']): void {
  switch (effect) {
    case 'show': eff.visible = true; break;
    case 'hide': eff.visible = false; break;
    case 'require': eff.required = true; break;
    case 'optional': eff.required = false; break;
    case 'enable': eff.enabled = true; break;
    case 'disable': eff.enabled = false; break;
  }
}

// ---- VALIDATION -------------------------------------------------------------

function evalValidation(
  rule: EvaluableRule,
  resolve: (path: string) => unknown,
  diagnostics: Diagnostic[],
): void {
  const action = rule.action as ValidationAction;
  const severity = rule.severity ?? RuleSeverity.ERROR;
  const value = resolve(action.field);
  const push = (message: string) =>
    diagnostics.push({ ruleKey: rule.key, severity, fieldPath: action.field, message: action.message ?? message });

  if (action.required && isEmpty(value)) {
    push('This field is required');
    return; // nothing else to check on an empty value
  }
  if (isEmpty(value)) return;

  if (typeof action.min === 'number' || typeof action.max === 'number') {
    const n = toNumber(value);
    if (n === null) {
      push('Value must be a number');
    } else {
      if (typeof action.min === 'number' && n < action.min) push(`Value must be at least ${action.min}`);
      if (typeof action.max === 'number' && n > action.max) push(`Value must be at most ${action.max}`);
    }
  }
  if (action.allowedValues && !action.allowedValues.map(String).includes(String(value))) {
    push('Value is not one of the allowed values');
  }
  if (action.format && !NAMED_PATTERNS[action.format].test(String(value))) {
    push(`Value does not match the required format (${action.format})`);
  }
}

// ---- Condition evaluation ---------------------------------------------------

function evalCondition(
  node: ConditionNode,
  resolve: (path: string) => unknown,
  diagnostics: Diagnostic[],
  ruleKey: string,
): boolean {
  if (isAllNode(node)) return node.all.every((n) => evalCondition(n, resolve, diagnostics, ruleKey));
  if (isAnyNode(node)) return node.any.some((n) => evalCondition(n, resolve, diagnostics, ruleKey));
  if (isNotNode(node)) return !evalCondition(node.not, resolve, diagnostics, ruleKey);
  if (isComparisonNode(node)) return evalComparison(node, resolve, diagnostics, ruleKey);
  return false;
}

function evalComparison(
  node: ComparisonNode,
  resolve: (path: string) => unknown,
  diagnostics: Diagnostic[],
  ruleKey: string,
): boolean {
  const left = evalOperand(node.left, resolve, diagnostics, ruleKey);

  if (node.op === 'isEmpty') return isEmpty(left);
  if (node.op === 'isNotEmpty') return !isEmpty(left);

  if (node.right === undefined) return false;
  const right = evalOperand(node.right, resolve, diagnostics, ruleKey);

  switch (node.op) {
    case 'in':
      return Array.isArray(right) && right.map(String).includes(String(left));
    case 'notIn':
      if (isEmpty(left)) return false; // comparison against null is false
      return Array.isArray(right) && !right.map(String).includes(String(left));
    case 'between': {
      if (!Array.isArray(right) || right.length < 2) return false;
      const n = toNumber(left);
      const lo = toNumber(right[0]);
      const hi = toNumber(right[1]);
      if (n === null || lo === null || hi === null) return false;
      return n >= lo && n <= hi;
    }
    case 'matches': {
      if (isEmpty(left)) return false;
      const pattern = NAMED_PATTERNS[String(right) as NamedPattern];
      return pattern ? pattern.test(String(left)) : false;
    }
    default:
      return evalOrderingOrEquality(node.op, left, right);
  }
}

function evalOrderingOrEquality(op: ComparisonNode['op'], left: unknown, right: unknown): boolean {
  if (isEmpty(left) || isEmpty(right)) return false; // comparisons against null are false

  const ln = toNumber(left);
  const rn = toNumber(right);
  const bothNumeric = ln !== null && rn !== null;

  switch (op) {
    case 'eq':
      return bothNumeric ? ln === rn : String(left) === String(right);
    case 'ne':
      return bothNumeric ? ln !== rn : String(left) !== String(right);
    case 'gt':
      return bothNumeric ? ln > rn : String(left) > String(right);
    case 'gte':
      return bothNumeric ? ln >= rn : String(left) >= String(right);
    case 'lt':
      return bothNumeric ? ln < rn : String(left) < String(right);
    case 'lte':
      return bothNumeric ? ln <= rn : String(left) <= String(right);
    default:
      return false;
  }
}

// ---- Operand & expression evaluation ---------------------------------------

function evalOperand(
  operand: Operand,
  resolve: (path: string) => unknown,
  diagnostics: Diagnostic[],
  ruleKey: string,
): unknown {
  if (isFieldOperand(operand)) return resolve(operand.field);
  if (isConstOperand(operand)) return operand.const;
  // calc operand
  return evalExpr(operand.calc, resolve, diagnostics, ruleKey);
}

/** Evaluate a numeric expression. Any missing operand propagates to `null`. */
function evalExpr(
  node: ExprNode,
  resolve: (path: string) => unknown,
  diagnostics: Diagnostic[],
  ruleKey: string,
): number | null {
  const nums = node.args.map((arg) =>
    isExprNode(arg) ? evalExpr(arg, resolve, diagnostics, ruleKey) : toNumber(evalOperand(arg, resolve, diagnostics, ruleKey)),
  );

  switch (node.op) {
    case 'add':
    case 'sum':
      return reduceNullable(nums, (a, b) => a + b, 0);
    case 'sub':
      return reduceNullable(nums, (a, b) => a - b);
    case 'mul':
      return reduceNullable(nums, (a, b) => a * b, 1);
    case 'min':
      return reduceNullable(nums, (a, b) => Math.min(a, b));
    case 'max':
      return reduceNullable(nums, (a, b) => Math.max(a, b));
    case 'abs': {
      const v = nums[0];
      return v === null || v === undefined ? null : Math.abs(v);
    }
    case 'round': {
      const v = nums[0];
      if (v === null || v === undefined) return null;
      const places = nums[1] ?? 0;
      if (places === null) return null;
      const factor = Math.pow(10, places);
      return Math.round(v * factor) / factor;
    }
    case 'div': {
      const a = nums[0];
      const b = nums[1];
      if (a === null || a === undefined || b === null || b === undefined || b === 0) {
        diagnostics.push({
          ruleKey,
          severity: RuleSeverity.INFO,
          message: 'Division skipped (divide by zero or missing value)',
        });
        return null;
      }
      return a / b;
    }
    default:
      return null;
  }
}

/** Fold numbers; if any element is null/undefined the whole result is null. */
function reduceNullable(
  nums: Array<number | null | undefined>,
  fn: (a: number, b: number) => number,
  seed?: number,
): number | null {
  if (nums.length === 0) return seed ?? null;
  let acc: number;
  let start: number;
  if (seed !== undefined) {
    acc = seed;
    start = 0;
  } else {
    const first = nums[0];
    if (first === null || first === undefined) return null;
    acc = first;
    start = 1;
  }
  for (let i = start; i < nums.length; i++) {
    const v = nums[i];
    if (v === null || v === undefined) return null;
    acc = fn(acc, v);
  }
  return acc;
}

// ---- Dependency ordering for calculations -----------------------------------

/**
 * Order calculation rules so a calculation that reads another calculation's
 * target runs after it. Cycles are rejected at config time; if one slips
 * through, the input order is used (a single best-effort pass, never a loop).
 */
function orderCalculations(calcRules: EvaluableRule[]): EvaluableRule[] {
  const byTarget = new Map<string, EvaluableRule>();
  for (const rule of calcRules) {
    const target = (rule.action as CalculationAction).target;
    if (target) byTarget.set(target, rule);
  }

  const ordered: EvaluableRule[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const visit = (rule: EvaluableRule): void => {
    const target = (rule.action as CalculationAction).target;
    if (visited.has(target)) return;
    if (inStack.has(target)) return; // cycle guard
    inStack.add(target);
    for (const ref of collectExprFieldRefs((rule.action as CalculationAction).expr)) {
      const dep = byTarget.get(ref);
      if (dep && dep.key !== rule.key) visit(dep);
    }
    inStack.delete(target);
    visited.add(target);
    ordered.push(rule);
  };

  for (const rule of calcRules) visit(rule);
  return ordered;
}

// ---- Field-reference collection ---------------------------------------------

export function collectFieldRefs(node: ConditionNode): string[] {
  const refs: string[] = [];
  const walk = (n: ConditionNode): void => {
    if (isAllNode(n)) n.all.forEach(walk);
    else if (isAnyNode(n)) n.any.forEach(walk);
    else if (isNotNode(n)) walk(n.not);
    else if (isComparisonNode(n)) {
      collectOperandRefs(n.left, refs);
      if (n.right) collectOperandRefs(n.right, refs);
    }
  };
  walk(node);
  return refs;
}

export function collectExprFieldRefs(node: ExprNode): string[] {
  const refs: string[] = [];
  const walk = (n: ExprNode): void => {
    for (const arg of n.args) {
      if (isExprNode(arg)) walk(arg);
      else collectOperandRefs(arg, refs);
    }
  };
  walk(node);
  return refs;
}

function collectOperandRefs(operand: Operand, refs: string[]): void {
  if (isFieldOperand(operand)) refs.push(operand.field);
  else if (isConstOperand(operand)) {
    /* no refs */
  } else collectExprFieldRefs(operand.calc).forEach((r) => refs.push(r));
}

/** Convenience: entries used by the fields endpoint and tests. */
export type { FieldCatalogEntry };
