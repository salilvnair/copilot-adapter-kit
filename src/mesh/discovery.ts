// ProviderDiscovery — registry of all engines. Add new providers here.
import { Engine } from './contract';
import { OpenAIEngine } from './engines/openai/openai-engine';

export class ProviderDiscovery {
  private index = new Map<string, Engine>();

  constructor() {
    this.register(new OpenAIEngine());
    // future: register(new AnthropicEngine());
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
