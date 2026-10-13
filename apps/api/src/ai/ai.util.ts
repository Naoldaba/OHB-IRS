/**
 * Parse model output as JSON, tolerantly. Models sometimes wrap JSON in a
 * ```json fence or add a leading sentence even when asked not to, so we strip a
 * fence and, failing that, fall back to the outermost `{…}` / `[…]` slice.
 * Returns `null` on anything unparseable (callers treat that as "AI unavailable"
 * and fall back to their non-AI path).
 */
export function parseJsonLoose(text: string | null | undefined): unknown | null {
  if (!text) return null;
  const trimmed = text.trim();

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidates = [
    fence?.[1]?.trim(),
    trimmed,
    sliceOutermost(trimmed, '{', '}'),
    sliceOutermost(trimmed, '[', ']'),
  ];

  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c);
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function sliceOutermost(s: string, open: string, close: string): string | null {
  const start = s.indexOf(open);
  const end = s.lastIndexOf(close);
  if (start < 0 || end <= start) return null;
  return s.slice(start, end + 1);
}

/** A promise that rejects after `ms`, for racing against a fetch/SDK call. */
export function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms),
  );
}
