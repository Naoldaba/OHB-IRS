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

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};
