/**
 * Unified, layout-agnostic validation of a submission's data against a report's
 * `fieldSchema`. This is the single entry point the API uses as its authority
 * and the web app uses for live UX; it dispatches to the per-layout validator.
 *
 * As with the matrix validator, rules here are purely structural/type rules
 * derived from the schema — no invented domain rules. Cross-field and business
 * rules are a separate configurable layer (IMPLEMENTATION_PLAN §6).
 */

import { FieldSchema, isMatrixSchema, SimpleFieldSchema } from './field-schema';
import {
  validateMatrixReportData,
  ValidationError,
  ValidateOptions,
  emptyMatrixData,
} from './validate-matrix';

export interface SubmissionValidationResult {
  ok: boolean;
  errors: ValidationError[];
  /** Cleaned data: unknown keys dropped, disabled matrix cells dropped. */
  normalized: Record<string, unknown>;
}

export function validateSubmissionData(
  schema: FieldSchema,
  data: unknown,
  options: ValidateOptions,
): SubmissionValidationResult {
  if (isMatrixSchema(schema)) {
    const result = validateMatrixReportData(schema, data, options);
    return {
      ok: result.ok,
      errors: result.errors,
      normalized: result.normalized as unknown as Record<string, unknown>,
    };
  }
  return validateSimpleData(schema, data, options);
}

/** Empty data skeleton for a fresh draft, shaped to the schema. */
export function emptySubmissionData(schema: FieldSchema): Record<string, unknown> {
  if (isMatrixSchema(schema)) {
    return emptyMatrixData(schema) as unknown as Record<string, unknown>;
  }
  const values: Record<string, unknown> = {};
  for (const section of schema.sections) {
    for (const field of section.fields) {
      values[field.key] = null;
    }
  }
  return { values };
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function validateSimpleData(
  schema: SimpleFieldSchema,
  data: unknown,
  options: ValidateOptions,
): SubmissionValidationResult {
  const errors: ValidationError[] = [];
  const normalizedValues: Record<string, unknown> = {};

  const rawValues =
    data && typeof data === 'object' && 'values' in (data as object)
      ? ((data as { values?: Record<string, unknown> }).values ?? {})
      : {};

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const path = `${section.key}.${field.key}`;
      const raw = (rawValues as Record<string, unknown>)[field.key];

      if (isBlank(raw)) {
        if (options.requireComplete && field.required) {
          errors.push({ path, message: `${section.label} / ${field.label} is required` });
        }
        normalizedValues[field.key] = null;
        continue;
      }

      switch (field.type) {
        case 'integer':
        case 'number': {
          const coerced = typeof raw === 'string' ? Number(raw) : raw;
          if (typeof coerced !== 'number' || Number.isNaN(coerced)) {
            errors.push({ path, message: `${field.label} must be a number` });
            normalizedValues[field.key] = null;
            break;
          }
          if (field.type === 'integer' && !Number.isInteger(coerced)) {
            errors.push({ path, message: `${field.label} must be a whole number` });
            normalizedValues[field.key] = null;
            break;
          }
          if (typeof field.min === 'number' && coerced < field.min) {
            errors.push({ path, message: `${field.label} must be at least ${field.min}` });
          }
          if (typeof field.max === 'number' && coerced > field.max) {
            errors.push({ path, message: `${field.label} must be at most ${field.max}` });
          }
          normalizedValues[field.key] = coerced;
          break;
        }
        case 'select': {
          const allowed = (field.options ?? []).map((o) => o.value);
          if (!allowed.includes(String(raw))) {
            errors.push({ path, message: `${field.label} must be one of the allowed options` });
            normalizedValues[field.key] = null;
            break;
          }
          normalizedValues[field.key] = String(raw);
          break;
        }
        case 'date': {
          const str = String(raw);
          // Canonical storage is an ISO date string (YYYY-MM-DD); the UI handles
          // Ethiopian-calendar presentation. Reject anything unparseable.
          if (Number.isNaN(Date.parse(str))) {
            errors.push({ path, message: `${field.label} must be a valid date` });
            normalizedValues[field.key] = null;
            break;
          }
          normalizedValues[field.key] = str;
          break;
        }
        case 'text':
        default:
          normalizedValues[field.key] = String(raw);
          break;
      }
    }
  }

  return { ok: errors.length === 0, errors, normalized: { values: normalizedValues } };
}
