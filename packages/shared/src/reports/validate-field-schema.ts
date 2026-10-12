/**
 * Structural validation of a report's `fieldSchema` itself (not of submission
 * data — that is {@link validateSubmissionData}). Used when an admin creates or
 * publishes a definition version so a malformed structure can never become the
 * active definition labs fill against.
 *
 * The rules here are purely structural (shape, unique keys, internal
 * references). They do NOT invent domain/business rules — those are configurable
 * business rules (IMPLEMENTATION_PLAN §6), added later.
 */

import { FieldSchema } from './field-schema';
import { ValidationError } from './validate-matrix';

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const SIMPLE_FIELD_TYPES = new Set(['number', 'integer', 'text', 'date', 'select']);

export interface SchemaValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

function checkKey(key: unknown, path: string, errors: ValidationError[]): boolean {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    errors.push({
      path,
      message: `key must be lower_snake_case starting with a letter (got ${JSON.stringify(key)})`,
    });
    return false;
  }
  return true;
}

export function validateFieldSchema(schema: unknown): SchemaValidationResult {
  const errors: ValidationError[] = [];

  if (!schema || typeof schema !== 'object') {
    return { ok: false, errors: [{ path: '', message: 'fieldSchema must be an object' }] };
  }

  const layout = (schema as { layout?: unknown }).layout;
  if (layout === 'simple') {
    validateSimple(schema as Record<string, unknown>, errors);
  } else if (layout === 'matrix') {
    validateMatrix(schema as Record<string, unknown>, errors);
  } else if (layout === 'table') {
    validateTable(schema as Record<string, unknown>, errors);
  } else {
    errors.push({ path: 'layout', message: "layout must be 'simple', 'matrix', or 'table'" });
  }

  return { ok: errors.length === 0, errors };
}

function validateSimple(schema: Record<string, unknown>, errors: ValidationError[]): void {
  const sections = schema.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push({ path: 'sections', message: 'a simple schema needs at least one section' });
    return;
  }

  const sectionKeys = new Set<string>();
  sections.forEach((section, si) => {
    const s = section as Record<string, unknown>;
    const sPath = `sections[${si}]`;
    if (checkKey(s.key, `${sPath}.key`, errors)) {
      if (sectionKeys.has(s.key as string)) {
        errors.push({ path: `${sPath}.key`, message: `duplicate section key "${s.key}"` });
      }
      sectionKeys.add(s.key as string);
    }
    if (typeof s.label !== 'string' || s.label.trim() === '') {
      errors.push({ path: `${sPath}.label`, message: 'section label is required' });
    }

    const fields = s.fields;
    if (!Array.isArray(fields) || fields.length === 0) {
      errors.push({ path: `${sPath}.fields`, message: 'each section needs at least one field' });
      return;
    }
    const fieldKeys = new Set<string>();
    fields.forEach((field, fi) => {
      const f = field as Record<string, unknown>;
      const fPath = `${sPath}.fields[${fi}]`;
      if (checkKey(f.key, `${fPath}.key`, errors)) {
        if (fieldKeys.has(f.key as string)) {
          errors.push({ path: `${fPath}.key`, message: `duplicate field key "${f.key}"` });
        }
        fieldKeys.add(f.key as string);
      }
      if (typeof f.label !== 'string' || f.label.trim() === '') {
        errors.push({ path: `${fPath}.label`, message: 'field label is required' });
      }
      if (typeof f.type !== 'string' || !SIMPLE_FIELD_TYPES.has(f.type)) {
        errors.push({
          path: `${fPath}.type`,
          message: `type must be one of ${[...SIMPLE_FIELD_TYPES].join(', ')}`,
        });
      }
      if (f.type === 'select') {
        const options = f.options;
        if (!Array.isArray(options) || options.length === 0) {
          errors.push({ path: `${fPath}.options`, message: 'a select field needs at least one option' });
        }
      }
      if (
        (f.type === 'number' || f.type === 'integer') &&
        typeof f.min === 'number' &&
        typeof f.max === 'number' &&
        f.min > f.max
      ) {
        errors.push({ path: `${fPath}`, message: 'min cannot be greater than max' });
      }
    });
  });
}

function validateMatrix(schema: Record<string, unknown>, errors: ValidationError[]): void {
  const columnGroups = schema.columnGroups;
  const metrics = schema.metrics;
  const rows = schema.rows;

  if (!Array.isArray(columnGroups) || columnGroups.length === 0) {
    errors.push({ path: 'columnGroups', message: 'a matrix schema needs at least one column group' });
  }
  if (!Array.isArray(metrics) || metrics.length === 0) {
    errors.push({ path: 'metrics', message: 'a matrix schema needs at least one metric' });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push({ path: 'rows', message: 'a matrix schema needs at least one row' });
  }
  if (errors.length > 0) return;

  const groupKeys = collectKeys(columnGroups as unknown[], 'columnGroups', errors);
  const metricKeys = collectKeys(metrics as unknown[], 'metrics', errors);

  const rowKeys = new Set<string>();
  (rows as unknown[]).forEach((row, ri) => {
    const r = row as Record<string, unknown>;
    const rPath = `rows[${ri}]`;
    if (checkKey(r.key, `${rPath}.key`, errors)) {
      if (rowKeys.has(r.key as string)) {
        errors.push({ path: `${rPath}.key`, message: `duplicate row key "${r.key}"` });
      }
      rowKeys.add(r.key as string);
    }
    if (typeof r.label !== 'string' || r.label.trim() === '') {
      errors.push({ path: `${rPath}.label`, message: 'row label is required' });
    }
    const applicable = r.applicableMetrics;
    if (!Array.isArray(applicable) || applicable.length === 0) {
      errors.push({ path: `${rPath}.applicableMetrics`, message: 'each row needs at least one applicable metric' });
    } else {
      applicable.forEach((m) => {
        if (!metricKeys.has(m as string)) {
          errors.push({
            path: `${rPath}.applicableMetrics`,
            message: `applicable metric "${m}" is not a defined metric`,
          });
        }
      });
    }
  });
}

function validateTable(schema: Record<string, unknown>, errors: ValidationError[]): void {
  const dimensions = schema.dimensions;
  const columnGroups = schema.columnGroups;
  const metrics = schema.metrics;

  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    errors.push({ path: 'dimensions', message: 'a table schema needs at least one dimension column' });
  }
  if (!Array.isArray(columnGroups) || columnGroups.length === 0) {
    errors.push({ path: 'columnGroups', message: 'a table schema needs at least one column group' });
  }
  if (!Array.isArray(metrics) || metrics.length === 0) {
    errors.push({ path: 'metrics', message: 'a table schema needs at least one metric' });
  }
  if (errors.length > 0) return;

  const dimKeys = new Set<string>();
  (dimensions as unknown[]).forEach((dim, di) => {
    const d = dim as Record<string, unknown>;
    const dPath = `dimensions[${di}]`;
    if (checkKey(d.key, `${dPath}.key`, errors)) {
      if (dimKeys.has(d.key as string)) {
        errors.push({ path: `${dPath}.key`, message: `duplicate dimension key "${d.key}"` });
      }
      dimKeys.add(d.key as string);
    }
    if (typeof d.label !== 'string' || d.label.trim() === '') {
      errors.push({ path: `${dPath}.label`, message: 'dimension label is required' });
    }
    if (typeof d.type !== 'string' || !SIMPLE_FIELD_TYPES.has(d.type)) {
      errors.push({ path: `${dPath}.type`, message: `type must be one of ${[...SIMPLE_FIELD_TYPES].join(', ')}` });
    }
    if (d.type === 'select') {
      const options = d.options;
      if (!Array.isArray(options) || options.length === 0) {
        errors.push({ path: `${dPath}.options`, message: 'a select dimension needs at least one option' });
      }
    }
  });

  collectKeys(columnGroups as unknown[], 'columnGroups', errors);
  collectKeys(metrics as unknown[], 'metrics', errors);

  if (schema.minRows !== undefined && (typeof schema.minRows !== 'number' || schema.minRows < 0)) {
    errors.push({ path: 'minRows', message: 'minRows must be a non-negative number' });
  }
}

/** Validates keys/labels of a {key,label} list and returns the set of keys. */
function collectKeys(list: unknown[], path: string, errors: ValidationError[]): Set<string> {
  const keys = new Set<string>();
  list.forEach((item, i) => {
    const it = item as Record<string, unknown>;
    const p = `${path}[${i}]`;
    if (checkKey(it.key, `${p}.key`, errors)) {
      if (keys.has(it.key as string)) {
        errors.push({ path: `${p}.key`, message: `duplicate key "${it.key}"` });
      }
      keys.add(it.key as string);
    }
    if (typeof it.label !== 'string' || it.label.trim() === '') {
      errors.push({ path: `${p}.label`, message: 'label is required' });
    }
  });
  return keys;
}
