import { Global, Logger, Module } from '@nestjs/common';
import { AI, AiProvider } from './ai.provider';
import { loadAiConfig } from './ai.config';
import { DisabledAiProvider } from './disabled.ai';
import { OpenAiCompatibleProvider } from './openai.ai';
import { GeminiProvider } from './gemini.ai';
import { AnthropicProvider } from './anthropic.ai';

/**
 * Provides the configured {@link AiProvider} under the {@link AI} token. Global
 * so any feature (the report-import assist today; OCR / NL-analytics later) can
 * inject it. The driver is selected from `AI_DRIVER`; **`disabled` by default**,
 * so no AI runs until an operator opts in. Works with any provider — a generic
 * OpenAI-compatible endpoint plus native Gemini and Claude drivers.
 */
@Global()
@Module({
  providers: [
    {
      provide: AI,
      useFactory: (): AiProvider => {
        const cfg = loadAiConfig();
        const logger = new Logger('AiModule');
        switch (cfg.driver) {
          case 'openai': {
            const p = new OpenAiCompatibleProvider(
              cfg.baseUrl,
              cfg.apiKey,
              cfg.model,
              cfg.timeoutMs,
              cfg.maxOutputTokens,
            );
            if (p.enabled) logger.log(`AI assist on via OpenAI-compatible endpoint (model ${cfg.model}).`);
            return p;
          }
          case 'gemini': {
            const p = new GeminiProvider(cfg.apiKey, cfg.model, cfg.timeoutMs, cfg.maxOutputTokens);
            if (p.enabled) logger.log(`AI assist on via Gemini (model ${cfg.model}).`);
            return p;
          }
          case 'anthropic': {
            const p = new AnthropicProvider(cfg.apiKey, cfg.model, cfg.timeoutMs, cfg.maxOutputTokens);
            if (p.enabled) logger.log(`AI assist on via Anthropic (model ${cfg.model}).`);
            return p;
          }
          default:
            return new DisabledAiProvider();
        }
      },
    },
  ],
  exports: [AI],
})
export class AiModule {}
