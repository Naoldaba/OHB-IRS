/**
 * Field/section/row keys must be lower_snake_case starting with a letter
 * (shared KEY_PATTERN). The builder derives keys from human labels but lets the
 * admin override them, so historical field paths stay stable.
 */
export function slugifyKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) return '';
  return /^[a-z]/.test(base) ? base : `f_${base}`;
}

/** True when a key already satisfies the shared KEY_PATTERN. */
export function isValidKey(key: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(key);
}
