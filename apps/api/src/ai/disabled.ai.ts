import { AiProvider } from './ai.provider';

/** The default provider: AI is off, so every request resolves to `null`. */
export class DisabledAiProvider extends AiProvider {
  readonly enabled = false;
  readonly driver = 'disabled';

  async generateJson(): Promise<null> {
    return null;
  }
}
