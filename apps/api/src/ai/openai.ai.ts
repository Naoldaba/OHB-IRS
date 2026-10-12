import { Logger } from '@nestjs/common';
import { AiJsonRequest, AiProvider } from './ai.provider';
import { parseJsonLoose, timeout } from './ai.util';

/**
 * Universal driver: any OpenAI-compatible Chat Completions endpoint. One shape
 * covers OpenAI, Gemini's OpenAI endpoint, OpenRouter, Groq, Together, DeepSeek,
 * Mistral, and local servers (Ollama, LM Studio, …). Plain `fetch` — no SDK —
 * so a provider is just a base URL + key + model.
 *
 * Best-effort: any failure (missing config, transport error, timeout, non-JSON
 * body) resolves to `null` and the caller falls back to its non-AI path.
 */
export class OpenAiCompatibleProvider extends AiProvider {
  readonly enabled: boolean;
  readonly driver = 'openai';
  private readonly logger = new Logger('AiProvider:openai');

  constructor(
    private readonly baseUrl: string | null,
    private readonly apiKey: string | null,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly maxOutputTokens: number,
  ) {
    super();
    this.enabled = Boolean(baseUrl && apiKey && model);
    if (!this.enabled) {
      this.logger.warn(
        'AI_DRIVER="openai" is set but AI_BASE_URL / AI_API_KEY / AI_MODEL are incomplete; AI assist is off.',
      );
    }
  }

  async generateJson(req: AiJsonRequest): Promise<unknown | null> {
    if (!this.enabled) return null;
    try {
      const call = fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: req.maxTokens ?? this.maxOutputTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        }),
      });

      const res = (await Promise.race([call, timeout(this.timeoutMs)])) as Response;
      if (!res.ok) {
        this.logger.warn(`Model request failed (${res.status}); falling back to heuristic.`);
        return null;
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return parseJsonLoose(body.choices?.[0]?.message?.content);
    } catch (err) {
      this.logger.warn(`Model call error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
