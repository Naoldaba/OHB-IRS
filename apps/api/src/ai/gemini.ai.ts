import { Logger } from '@nestjs/common';
import { AiJsonRequest, AiProvider } from './ai.provider';
import { parseJsonLoose, timeout } from './ai.util';

/**
 * Native Google Gemini driver (Generative Language API `generateContent`). A
 * convenience over the generic `openai` driver for a free Gemini key — no base
 * URL to look up, just `AI_API_KEY` (or `GEMINI_API_KEY`) and `AI_MODEL`. Uses
 * `responseMimeType: application/json` so the model returns JSON directly.
 *
 * Best-effort: any failure resolves to `null`.
 */
export class GeminiProvider extends AiProvider {
  readonly enabled: boolean;
  readonly driver = 'gemini';
  private readonly logger = new Logger('AiProvider:gemini');

  constructor(
    private readonly apiKey: string | null,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly maxOutputTokens: number,
  ) {
    super();
    this.enabled = Boolean(apiKey && model);
    if (!this.enabled) {
      this.logger.warn(
        'AI_DRIVER="gemini" is set but no API key (AI_API_KEY / GEMINI_API_KEY) was found; AI assist is off.',
      );
    }
  }

  async generateJson(req: AiJsonRequest): Promise<unknown | null> {
    if (!this.enabled) return null;
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey as string)}`;
      const call = fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: req.maxTokens ?? this.maxOutputTokens,
            responseMimeType: 'application/json',
          },
        }),
      });

      const res = (await Promise.race([call, timeout(this.timeoutMs)])) as Response;
      if (!res.ok) {
        this.logger.warn(`Model request failed (${res.status}); falling back to heuristic.`);
        return null;
      }
      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
      return parseJsonLoose(text);
    } catch (err) {
      this.logger.warn(`Model call error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
