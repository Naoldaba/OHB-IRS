/**
 * Config-time validation of a set of business rules against a report's field
 * schema (IMPLEMENTATION_PLAN §6.5 step 2). Runs when an admin saves a rule,
 * calls the validate endpoint, or publishes a version — never at submit time.
 * It guarantees the evaluator only ever sees well-formed, bounded, acyclic rules.
 *
 * Checks:
 *   - unique rule keys; rule count within bounds;
 *   - `kind` valid; `severity` present & valid for VALIDATION/CROSS_FIELD;
 *   - condition / expression ASTs use only whitelisted operators and are within
 *     depth/size bounds;
 *   - every field reference exists in the catalog and is type-compatible with
 *     the operator using it;
 *   - per-kind action shape (VALIDATION constraint present; CONDITIONAL effect +
 *     targets; CALCULATION numeric target + expr; CROSS_FIELD invariant present);
 *   - no dependency cycles among calculated fields.
 */

import { BusinessRuleKind, RuleSeverity } from '../../enums';
import { FieldSchema } from '../field-schema';
import { buildCatalogMap, FieldCatalogEntry } from './field-catalog';
import { collectExprFieldRefs } from './evaluate';
import {
  CalculationAction,
  COMPARISON_OPS,
  ComparisonNode,
  ConditionalAction,
  ConditionNode,
  CONDITIONAL_EFFECTS,
  CrossFieldAction,
  EvaluableRule,
  EXPR_OPS,
  ExprNode,
  isAllNode,
  isAnyNode,
  isComparisonNode,
  isConstOperand,
  isFieldOperand,
  isNotNode,
  NAMED_PATTERNS,
  Operand,
  ORDERED_OPS,
  UNARY_OPS,
  ValidationAction,
} from './rule-ast';

export interface RuleConfigError {
  ruleKey?: string;
  path: string;
  message: string;
}

export interface RuleValidationResult {
  ok: boolean;
  errors: RuleConfigError[];
}

/** Resource bounds (IMPLEMENTATION_PLAN §6.8) that prevent pathological configs. */
export const RULE_LIMITS = {
  maxRules: 200,
  maxAstDepth: 20,
  maxAstNodes: 200,
} as const;

const VALID_KINDS = new Set(Object.values(BusinessRuleKind));
const VALID_SEVERITIES = new Set(Object.values(RuleSeverity));
const COMPARISON_OP_SET = new Set<string>(COMPARISON_OPS);
const EXPR_OP_SET = new Set<string>(EXPR_OPS);
const EFFECT_SET = new Set<string>(CONDITIONAL_EFFECTS);
const NAMED_PATTERN_SET = new Set<string>(NAMED_PATTERNS);

const NUMERIC_TYPES = new Set(['number', 'integer']);

export function validateRules(schema: FieldSchema, rules: EvaluableRule[]): RuleValidationResult {
  const errors: RuleConfigError[] = [];
  const catalog = buildCatalogMap(schema);

  if (!Array.isArray(rules)) {
    return { ok: false, errors: [{ path: 'rules', message: 'rules must be an array' }] };
  }
  if (rules.length > RULE_LIMITS.maxRules) {
    errors.push({ path: 'rules', message: `too many rules (max ${RULE_LIMITS.maxRules})` });
  }

  const seenKeys = new Set<string>();
  for (const rule of rules) {
    const ruleKey = rule?.key;
    const err = (path: string, message: string) => errors.push({ ruleKey, path, message });

    if (!ruleKey || typeof ruleKey !== 'string') {
      err('key', 'rule key is required');
    } else if (seenKeys.has(ruleKey)) {
      err('key', `duplicate rule key "${ruleKey}"`);
    } else {
      seenKeys.add(ruleKey);
    }

    if (!VALID_KINDS.has(rule.kind)) {
      err('kind', `kind must be one of ${[...VALID_KINDS].join(', ')}`);
      continue; // can't validate action/severity without a known kind
    }

    const severityRequired =
      rule.kind === BusinessRuleKind.VALIDATION || rule.kind === BusinessRuleKind.CROSS_FIELD;
    if (severityRequired) {
      if (!rule.severity || !VALID_SEVERITIES.has(rule.severity)) {
        err('severity', `severity must be one of ${[...VALID_SEVERITIES].join(', ')}`);
      }
    }

    if (rule.condition != null) {
      validateCondition(rule.condition, catalog, ruleKey, 'condition', errors, { depth: 0, nodes: { n: 0 } });
    }

    validateAction(rule, catalog, errors);
  }

  // Dependency-cycle detection among calculated fields.
  detectCalculationCycles(rules, errors);

  return { ok: errors.length === 0, errors };
}

// ---- Actions ----------------------------------------------------------------

function validateAction(
  rule: EvaluableRule,
  catalog: Map<string, FieldCatalogEntry>,
  errors: RuleConfigError[],
): void {
  const ruleKey = rule.key;
  const err = (path: string, message: string) => errors.push({ ruleKey, path, message });
  const action = rule.action as Record<string, unknown> | undefined;

  if (!action || typeof action !== 'object') {
    err('action', 'action is required');
    return;
  }

  switch (rule.kind) {
    case BusinessRuleKind.VALIDATION: {
      const a = action as unknown as ValidationAction;
      requireField(a.field, catalog, ruleKey, 'action.field', errors);
      const hasConstraint =
        a.required === true ||
        typeof a.min === 'number' ||
        typeof a.max === 'number' ||
        Array.isArray(a.allowedValues) ||
        typeof a.format === 'string';
      if (!hasConstraint) err('action', 'a VALIDATION rule needs at least one constraint (required/min/max/allowedValues/format)');
      if (a.format && !NAMED_PATTERN_SET.has(a.format)) {
        err('action.format', `format must be one of ${[...NAMED_PATTERN_SET].join(', ')}`);
      }
      if (typeof a.min === 'number' && typeof a.max === 'number' && a.min > a.max) {
        err('action', 'min cannot be greater than max');
      }
      break;
    }
    case BusinessRuleKind.CROSS_FIELD: {
      if (rule.condition == null) err('condition', 'a CROSS_FIELD rule needs a condition (the invariant that must hold)');
      const a = action as unknown as CrossFieldAction;
      if (a.targetField) requireField(a.targetField, catalog, ruleKey, 'action.targetField', errors);
      break;
    }
    case BusinessRuleKind.CONDITIONAL: {
      const a = action as unknown as ConditionalAction;
      if (rule.condition == null) err('condition', 'a CONDITIONAL rule needs a condition');
      if (!a.effect || !EFFECT_SET.has(a.effect)) {
        err('action.effect', `effect must be one of ${[...EFFECT_SET].join(', ')}`);
      }
      if (!Array.isArray(a.targets) || a.targets.length === 0) {
        err('action.targets', 'at least one target field is required');
      } else {
        a.targets.forEach((t, i) => requireField(t, catalog, ruleKey, `action.targets[${i}]`, errors));
      }
      break;
    }
    case BusinessRuleKind.CALCULATION: {
      const a = action as unknown as CalculationAction;
      const entry = requireField(a.target, catalog, ruleKey, 'action.target', errors);
      if (entry && !NUMERIC_TYPES.has(entry.type)) {
        err('action.target', `calculation target must be a number/integer field (got ${entry.type})`);
      }
      if (!a.expr || typeof a.expr !== 'object') {
        err('action.expr', 'a CALCULATION rule needs an expression');
      } else {
        validateExpr(a.expr, catalog, ruleKey, 'action.expr', errors, { depth: 0, nodes: { n: 0 } });
      }
      break;
    }
  }
}

// ---- Condition AST ----------------------------------------------------------

interface Budget {
  depth: number;
  nodes: { n: number };
}

function overBudget(budget: Budget, ruleKey: string | undefined, path: string, errors: RuleConfigError[]): boolean {
  budget.nodes.n += 1;
  if (budget.depth > RULE_LIMITS.maxAstDepth) {
    errors.push({ ruleKey, path, message: `expression nesting too deep (max ${RULE_LIMITS.maxAstDepth})` });
    return true;
  }
  if (budget.nodes.n > RULE_LIMITS.maxAstNodes) {
    errors.push({ ruleKey, path, message: `rule too large (max ${RULE_LIMITS.maxAstNodes} nodes)` });
    return true;
  }
  return false;
}

function validateCondition(
  node: ConditionNode,
  catalog: Map<string, FieldCatalogEntry>,
  ruleKey: string | undefined,
  path: string,
  errors: RuleConfigError[],
  budget: Budget,
): void {
  if (overBudget(budget, ruleKey, path, errors)) return;
  if (!node || typeof node !== 'object') {
    errors.push({ ruleKey, path, message: 'invalid condition node' });
    return;
  }

  if (isAllNode(node)) {
    if (!Array.isArray(node.all)) errors.push({ ruleKey, path: `${path}.all`, message: 'all must be an array' });
    else node.all.forEach((n, i) => validateCondition(n, catalog, ruleKey, `${path}.all[${i}]`, errors, { ...budget, depth: budget.depth + 1 }));
    return;
  }
  if (isAnyNode(node)) {
    if (!Array.isArray(node.any)) errors.push({ ruleKey, path: `${path}.any`, message: 'any must be an array' });
    else node.any.forEach((n, i) => validateCondition(n, catalog, ruleKey, `${path}.any[${i}]`, errors, { ...budget, depth: budget.depth + 1 }));
    return;
  }
  if (isNotNode(node)) {
    validateCondition(node.not, catalog, ruleKey, `${path}.not`, errors, { ...budget, depth: budget.depth + 1 });
    return;
  }
  if (isComparisonNode(node)) {
    validateComparison(node, catalog, ruleKey, path, errors, budget);
    return;
  }
  errors.push({ ruleKey, path, message: 'condition node must be a comparison or all/any/not group' });
}

function validateComparison(
  node: ComparisonNode,
  catalog: Map<string, FieldCatalogEntry>,
  ruleKey: string | undefined,
  path: string,
  errors: RuleConfigError[],
  budget: Budget,
): void {
  if (!COMPARISON_OP_SET.has(node.op)) {
    errors.push({ ruleKey, path: `${path}.op`, message: `unknown operator "${node.op}"` });
    return;
  }
  const leftType = validateOperand(node.left, catalog, ruleKey, `${path}.left`, errors, budget);

  if (UNARY_OPS.has(node.op)) {
    if (node.right !== undefined) errors.push({ ruleKey, path: `${path}.right`, message: `${node.op} takes no right operand` });
    return;
  }
  if (node.right === undefined) {
    errors.push({ ruleKey, path: `${path}.right`, message: `${node.op} needs a right operand` });
    return;
  }
  const rightType = validateOperand(node.right, catalog, ruleKey, `${path}.right`, errors, budget);

  // Ordered comparisons require numeric/date operands on the field side.
  if (ORDERED_OPS.has(node.op)) {
    for (const [operand, type, side] of [
      [node.left, leftType, 'left'] as const,
      [node.right, rightType, 'right'] as const,
    ]) {
      if (isFieldOperand(operand) && type && !NUMERIC_TYPES.has(type) && type !== 'date') {
        errors.push({ ruleKey, path: `${path}.${side}`, message: `${node.op} requires a numeric or date field (got ${type})` });
      }
    }
  }
  if ((node.op === 'in' || node.op === 'notIn') && isConstOperand(node.right) && !Array.isArray(node.right.const)) {
    errors.push({ ruleKey, path: `${path}.right`, message: `${node.op} needs a list constant` });
  }
  if (node.op === 'between' && isConstOperand(node.right) && (!Array.isArray(node.right.const) || node.right.const.length < 2)) {
    errors.push({ ruleKey, path: `${path}.right`, message: 'between needs a [min, max] list constant' });
  }
  if (node.op === 'matches' && isConstOperand(node.right) && !NAMED_PATTERN_SET.has(String(node.right.const))) {
    errors.push({ ruleKey, path: `${path}.right`, message: `matches needs a named pattern: ${[...NAMED_PATTERN_SET].join(', ')}` });
  }
}

/** Returns the field type when the operand is a known field, else undefined. */
function validateOperand(
  operand: Operand,
  catalog: Map<string, FieldCatalogEntry>,
  ruleKey: string | undefined,
  path: string,
  errors: RuleConfigError[],
  budget: Budget,
): FieldCatalogEntry['type'] | undefined {
  if (!operand || typeof operand !== 'object') {
    errors.push({ ruleKey, path, message: 'operand must be a {field}, {const} or {calc}' });
    return undefined;
  }
  if (isFieldOperand(operand)) {
    const entry = requireField(operand.field, catalog, ruleKey, `${path}.field`, errors);
    return entry?.type;
  }
  if (isConstOperand(operand)) return undefined;
  // calc operand
  validateExpr(operand.calc, catalog, ruleKey, `${path}.calc`, errors, { ...budget, depth: budget.depth + 1 });
  return 'number';
}

// ---- Expression AST ---------------------------------------------------------

function validateExpr(
  node: ExprNode,
  catalog: Map<string, FieldCatalogEntry>,
  ruleKey: string | undefined,
  path: string,
  errors: RuleConfigError[],
  budget: Budget,
): void {
  if (overBudget(budget, ruleKey, path, errors)) return;
  if (!node || typeof node !== 'object' || !('op' in node)) {
    errors.push({ ruleKey, path, message: 'invalid expression node' });
    return;
  }
  if (!EXPR_OP_SET.has(node.op)) {
    errors.push({ ruleKey, path: `${path}.op`, message: `unknown expression operator "${node.op}"` });
    return;
  }
  if (!Array.isArray(node.args) || node.args.length === 0) {
    errors.push({ ruleKey, path: `${path}.args`, message: 'expression needs at least one argument' });
    return;
  }
  node.args.forEach((arg, i) => {
    if (arg && typeof arg === 'object' && 'op' in arg) {
      validateExpr(arg as ExprNode, catalog, ruleKey, `${path}.args[${i}]`, errors, { ...budget, depth: budget.depth + 1 });
    } else {
      const operand = arg as Operand;
      const type = validateOperand(operand, catalog, ruleKey, `${path}.args[${i}]`, errors, budget);
      if (isFieldOperand(operand) && type && !NUMERIC_TYPES.has(type)) {
        errors.push({ ruleKey, path: `${path}.args[${i}]`, message: `arithmetic needs a numeric field (got ${type})` });
      }
    }
  });
}

// ---- Shared helpers ---------------------------------------------------------

function requireField(
  field: unknown,
  catalog: Map<string, FieldCatalogEntry>,
  ruleKey: string | undefined,
  path: string,
  errors: RuleConfigError[],
): FieldCatalogEntry | undefined {
  if (typeof field !== 'string' || field.length === 0) {
    errors.push({ ruleKey, path, message: 'a field reference is required' });
    return undefined;
  }
  const entry = catalog.get(field);
  if (!entry) {
    errors.push({ ruleKey, path, message: `unknown field "${field}"` });
    return undefined;
  }
  return entry;
}

/**
 * A calculation that (transitively) reads its own target is a cycle. Edges run
 * from a calculated target to every calculated target its expression reads.
 */
function detectCalculationCycles(rules: EvaluableRule[], errors: RuleConfigError[]): void {
  const calcByTarget = new Map<string, EvaluableRule>();
  for (const rule of rules) {
    if (rule.kind !== BusinessRuleKind.CALCULATION) continue;
    const target = (rule.action as CalculationAction)?.target;
    if (typeof target === 'string') calcByTarget.set(target, rule);
  }
  if (calcByTarget.size === 0) return;

  const state = new Map<string, 'visiting' | 'done'>();
  const reported = new Set<string>();

  const visit = (target: string): boolean => {
    const current = state.get(target);
    if (current === 'done') return false;
    if (current === 'visiting') return true; // back-edge => cycle
    state.set(target, 'visiting');
    const rule = calcByTarget.get(target);
    if (rule) {
      const expr = (rule.action as CalculationAction).expr;
      const refs = expr ? collectExprFieldRefs(expr) : [];
      for (const ref of refs) {
        if (ref === target || calcByTarget.has(ref)) {
          if (visit(ref) && !reported.has(target)) {
            reported.add(target);
            errors.push({
              ruleKey: rule.key,
              path: 'action.expr',
              message: `calculation for "${target}" forms a dependency cycle`,
            });
          }
        }
      }
    }
    state.set(target, 'done');
    return false;
  };

  for (const target of calcByTarget.keys()) visit(target);
}
