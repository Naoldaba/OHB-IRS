/**
 * Thin, typed client for the OHB NestJS API. Every request is credentialed so
 * the httpOnly session cookie (`ohb.sid`) rides along; the API is the authority
 * for authorization and validation — this client never assumes success.
 */

const BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000') + '/api';

export interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  /** Field-schema / submission validation errors from the shared validators. */
  errors?: { path: string; message: string }[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(ApiError.messageFrom(status, body));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** Field-level validation errors, when the server returned any. */
  get fieldErrors(): { path: string; message: string }[] {
    return this.body?.errors ?? [];
  }

  private static messageFrom(status: number, body: ApiErrorBody | null): string {
    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join('; ') : body.message;
    }
    if (body?.error) return body.error;
    return `Request failed (${status})`;
  }
}

async function request<T>(
  method: string,
  path: string,
  payload?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: payload !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, { message: 'Could not reach the server. Is the API running?' });
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Multipart upload. The browser must set the `Content-Type` (with the multipart
 * boundary) itself, so we never set it here. Credentialed like every request.
 */
async function upload<T>(path: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: form,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, { message: 'Could not reach the server. Is the API running?' });
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Download a binary file from the API (credentialed), honouring the server's
 * `Content-Disposition` filename, and trigger a browser save. Errors surface as
 * ApiError so callers can show a message.
 */
async function download(path: string, fallbackName = 'download'): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { credentials: 'include', cache: 'no-store' });
  } catch {
    throw new ApiError(0, { message: 'Could not reach the server. Is the API running?' });
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }

  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackName;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1].replace(/"/g, '').trim());
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload,
  download,
};
