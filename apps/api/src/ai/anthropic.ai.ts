import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiJsonRequest, AiProvider } from './ai.provider';
import { parseJsonLoose, timeout } from './ai.util';

/**
 * Native Anthropic Claude driver (`@anthropic-ai/sdk`). The model is asked to
 * reply with JSON only and the response text is parsed tolerantly. Best-effort:
 * any failure resolves to `null`.
 */
export class AnthropicProvider extends AiProvider {
  readonly enabled: boolean;
  readonly driver = 'anthropic';
  private readonly logger = new Logger('AiProvider:anthropic');
  private readonly client: Anthropic | null;

  constructor(
    apiKey: string | null,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly maxOutputTokens: number,
  ) {
    super();
    this.enabled = Boolean(apiKey && model);
    this.client = this.enabled ? new Anthropic({ apiKey: apiKey as string }) : null;
    if (!this.enabled) {
      this.logger.warn(
        'AI_DRIVER="anthropic" is set but no API key (AI_API_KEY / ANTHROPIC_API_KEY) was found; AI assist is off.',
      );
    }
  }

  async generateJson(req: AiJsonRequest): Promise<unknown | null> {
    if (!this.enabled || !this.client) return null;
    try {
      const call = this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? this.maxOutputTokens,
        system: `${req.system}\n\nReply with a single valid JSON object and nothing else.`,
        messages: [{ role: 'user', content: req.user }],
      });

      const res = (await Promise.race([call, timeout(this.timeoutMs)])) as Awaited<typeof call>;
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return parseJsonLoose(text);
    } catch (err) {
      this.logger.warn(`Model call error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
