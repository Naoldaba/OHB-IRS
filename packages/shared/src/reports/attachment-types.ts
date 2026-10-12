/**
 * File-type categories for attachment-only (`document`) reports. One source of
 * truth shared by the builder (the admin's allowed-types checklist + the upload
 * `accept` hint) and the server (authoritative validation of an uploaded file).
 * A document report stores the selected category keys in
 * `DocumentFieldSchema.allowedFileTypes`; an empty/absent list means "any
 * supported type".
 */

export interface FileTypeCategory {
  key: string;
  label: string;
  /** MIME types that count as this category. */
  mimeTypes: string[];
  /** Lowercase extensions (no dot) for the `accept` hint. */
  extensions: string[];
}

export const FILE_TYPE_CATEGORIES: FileTypeCategory[] = [
  { key: 'pdf', label: 'PDF', mimeTypes: ['application/pdf'], extensions: ['pdf'] },
  {
    key: 'excel',
    label: 'Excel',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    extensions: ['xlsx', 'xls'],
  },
  {
    key: 'word',
    label: 'Word',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ],
    extensions: ['docx', 'doc'],
  },
  {
    key: 'image',
    label: 'Image',
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
  },
  { key: 'csv', label: 'CSV', mimeTypes: ['text/csv'], extensions: ['csv'] },
  { key: 'text', label: 'Text', mimeTypes: ['text/plain'], extensions: ['txt'] },
];

const BY_KEY = new Map(FILE_TYPE_CATEGORIES.map((c) => [c.key, c]));

/** Known category keys only. */
export function validFileTypeKeys(keys: string[] | undefined): string[] {
  if (!Array.isArray(keys)) return [];
  return keys.filter((k) => BY_KEY.has(k));
}

/** The set of MIME types allowed by a list of category keys. */
export function allowedMimeTypes(keys: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const k of validFileTypeKeys(keys)) {
    for (const m of BY_KEY.get(k)!.mimeTypes) out.add(m);
  }
  return out;
}

/** `accept` attribute value (dot-extensions) for a list of category keys. */
export function acceptForFileTypes(keys: string[] | undefined): string {
  const valid = validFileTypeKeys(keys);
  if (valid.length === 0) return '';
  const exts = new Set<string>();
  for (const k of valid) for (const e of BY_KEY.get(k)!.extensions) exts.add(`.${e}`);
  return [...exts].join(',');
}

/** Human labels for a list of category keys (for messages / the UI). */
export function fileTypeLabels(keys: string[] | undefined): string[] {
  return validFileTypeKeys(keys).map((k) => BY_KEY.get(k)!.label);
}
