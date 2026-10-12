import { Prisma } from '@prisma/client';
import {
  BusinessRuleKind,
  ConditionNode,
  EvaluableRule,
  FieldSchema,
  RuleAction,
  RuleSeverity,
} from '@ohb/shared';

/**
 * Narrow a jsonb field schema to a usable {@link FieldSchema}, or null if it is
 * not a recognised layout. Shared by the submissions and rules services so the
 * narrowing rule lives in one place.
 */
export function coerceFieldSchema(
  fieldSchema: Prisma.JsonValue | null | undefined,
): FieldSchema | null {
  if (!fieldSchema || typeof fieldSchema !== 'object' || Array.isArray(fieldSchema)) return null;
  const layout = (fieldSchema as { layout?: unknown }).layout;
  if (layout !== 'simple' && layout !== 'matrix' && layout !== 'table' && layout !== 'document') {
    return null;
  }
  return fieldSchema as unknown as FieldSchema;
}

/** The persisted BusinessRule shape (as read from Prisma) this mapper accepts. */
export interface PersistedRule {
  key: string;
  name: string;
  kind: string;
  severity: string | null;
  condition: Prisma.JsonValue;
  action: Prisma.JsonValue;
  enabled: boolean;
  order: number;
}

/** Map a persisted BusinessRule row to the pure-data shape the evaluator consumes. */
export function toEvaluableRule(row: PersistedRule): EvaluableRule {
  return {
    key: row.key,
    name: row.name,
    kind: row.kind as BusinessRuleKind,
    severity: (row.severity as RuleSeverity | null) ?? null,
    condition: emptyToNull(row.condition) as ConditionNode | null,
    action: (row.action ?? {}) as unknown as RuleAction,
    enabled: row.enabled,
    order: row.order,
  };
}

/** Treat `{}`/null/empty jsonb conditions as "no condition". */
function emptyToNull(value: Prisma.JsonValue): unknown {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return null;
  }
  return value;
}
