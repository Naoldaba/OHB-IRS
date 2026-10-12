/**
 * AI provider abstraction (Phase 29). Mirrors the {@link StorageProvider}
 * pattern: one contract, a driver selected by `AI_DRIVER`, injected via the
 * {@link AI} token, and a **`disabled` default** so the system ships with no AI
 * and makes no outbound calls until an operator opts in.
 *
 * This is deliberately thin and generic so later AI-assisted features (OCR
 * drafts, natural-language analytics) can reuse it. The data-exposure boundary
 * is the *caller's* responsibility — a provider will send whatever text it is
 * given — so each feature must only ever hand a provider content from the tier
 * it is allowed to expose (for Phase 29: report structure and labels, never a
 * report data value).
 */

/** A single structured-JSON request. Text in / parsed JSON out. */
export interface AiJsonRequest {
  /** System prompt — the model's role and the hard rules it must follow. */
  system: string;
  /** User content — the task payload (structure/labels only for Phase 29). */
  user: string;
  /** Soft cap on output tokens. Providers may clamp it. */
  maxTokens?: number;
}

/**
 * Contract every AI backend implements. Injected via the {@link AI} token.
 *
 * `generateJson` is **best-effort and never throws**: on a disabled provider, a
 * transport error, a timeout, or an unparseable response it resolves to `null`
 * so callers always fall back to their non-AI path cleanly (an AI failure must
 * never turn into a failed import).
 */
export abstract class AiProvider {
  /** Whether this provider will actually call a model. */
  abstract readonly enabled: boolean;
  /** The configured driver name, for diagnostics/audit (`disabled`, `anthropic`). */
  abstract readonly driver: string;

  /**
   * Sends the request to the model and returns its response parsed as JSON, or
   * `null` when AI is disabled or anything goes wrong. Implementations must not
   * throw.
   */
  abstract generateJson(req: AiJsonRequest): Promise<unknown | null>;
}

/** DI token for the configured {@link AiProvider}. */
export const AI = 'AI_PROVIDER';
