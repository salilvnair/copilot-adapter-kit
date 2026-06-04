// ProviderDiscovery — registry of all engines. Add new providers here.
import { KNOWN_FAMILIES } from '../kernel/families';
import { Engine } from './contract';
import { AnthropicEngine } from './engines/anthropic/anthropic-engine';
import { OpenAIEngine } from './engines/openai/openai-engine';

export class ProviderDiscovery {
  private index = new Map<string, Engine>();

  constructor() {
    // Anthropic uses its native Messages API engine.
    this.register(new AnthropicEngine());

    // All other families route through the OpenAI-compatible engine.
    for (const f of KNOWN_FAMILIES) {
      if (f.family === 'anthropic') continue; // already registered above
      this.register(new OpenAIEngine(f.family));
    }
  }

  register(engine: Engine): void { this.index.set(engine.family, engine); }

  lookup(family: string): Engine {
    const e = this.index.get(family);
    if (!e) throw new Error(`No engine registered for family "${family}"`);
    return e;
  }

  count(): number { return this.index.size; }

  families(): string[] { return [...this.index.keys()]; }
}
