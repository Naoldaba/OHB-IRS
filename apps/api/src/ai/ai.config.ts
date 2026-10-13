/**
 * AI settings, read once from the environment (same approach as the storage
 * config). The driver is **`disabled` by default** — no driver means no AI and
 * no outbound calls.
 *
 * It is designed to work with **any AI provider**:
 *   - `openai`    — the universal driver: any OpenAI-compatible
 *                   `/chat/completions` endpoint. Point `AI_BASE_URL` at the
 *                   provider (OpenAI, Gemini's OpenAI endpoint, OpenRouter,
 *                   Groq, Together, DeepSeek, Mistral, a local Ollama/LM Studio,
 *                   …), set `AI_API_KEY` and `AI_MODEL`, and it works.
 *   - `gemini`    — Google's native Generative Language API (a convenience for a
 *                   free Gemini key — no base URL to look up).
 *   - `anthropic` — Claude via `@anthropic-ai/sdk`.
 *
 * Env:
 *   AI_DRIVER            disabled (default) | openai | gemini | anthropic
 *   AI_MODEL             model id (driver-specific default when unset)
 *   AI_BASE_URL          OpenAI-compatible base URL (required for `openai`;
 *                        e.g. https://api.openai.com/v1,
 *                        https://generativelanguage.googleapis.com/v1beta/openai,
 *                        https://openrouter.ai/api/v1, http://localhost:11434/v1)
 *   AI_API_KEY           API key; falls back per driver to OPENAI_API_KEY /
 *                        GEMINI_API_KEY / GOOGLE_API_KEY / ANTHROPIC_API_KEY
 *   AI_TIMEOUT_MS        per-call timeout (default 20000)
 *   AI_MAX_OUTPUT_TOKENS soft output cap (default 4096)
 */

export type AiDriver = 'disabled' | 'openai' | 'gemini' | 'anthropic';

export interface AiConfig {
  driver: AiDriver;
  model: string;
  /** OpenAI-compatible base URL (no trailing slash). Only used by `openai`. */
  baseUrl: string | null;
  apiKey: string | null;
  timeoutMs: number;
  maxOutputTokens: number;
}

const DEFAULT_MODEL: Record<Exclude<AiDriver, 'disabled'>, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-opus-5-5',
};

function keyForDriver(driver: AiDriver): string | null {
  if (process.env.AI_API_KEY) return process.env.AI_API_KEY;
  switch (driver) {
    case 'openai':
      return process.env.OPENAI_API_KEY ?? null;
    case 'gemini':
      return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY ?? null;
    default:
      return null;
  }
}

export function loadAiConfig(): AiConfig {
  const raw = (process.env.AI_DRIVER ?? 'disabled').toLowerCase();
  const driver: AiDriver =
    raw === 'openai' || raw === 'gemini' || raw === 'anthropic' ? raw : 'disabled';

  const model =
    process.env.AI_MODEL ?? (driver === 'disabled' ? '' : DEFAULT_MODEL[driver]);

  const baseUrl = (process.env.AI_BASE_URL ?? '').replace(/\/+$/, '') || null;

  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 20000);
  const maxOutputTokens = Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 4096);

  return {
    driver,
    model,
    baseUrl,
    apiKey: keyForDriver(driver),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000,
    maxOutputTokens:
      Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 4096,
  };
}
