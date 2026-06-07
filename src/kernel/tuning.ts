import vscode from 'vscode';

export interface ProviderConfig {
  uuid?: string;
  family?: string;   // engine family: openai, deepseek, anthropic, …
  name?: string;
  baseUrl: string;
  defaultApiPath?: string;
  modelApiPaths?: Record<string, string>;
  modelAlias?: Record<string, string>;
  visionFallback?: string;
}

export type LogLevel = 'quiet' | 'meta' | 'dump';

/** Per‑provider config. Providers are keyed by UUID.  The `family` field maps to an engine. */
export class Tuning {
  private cfg = () => vscode.workspace.getConfiguration('copilot-adapter-kit');

  /** All non-deleted provider configs keyed by UUID (or legacy family key). */
  get providers(): Record<string, ProviderConfig> {
    const all = this.cfg().get<Record<string, any>>('providers') || {};
    const active: Record<string, any> = {};
    for (const [k, v] of Object.entries(all)) {
      if (v && !v._deleted) active[k] = v;
    }
    return active as Record<string, ProviderConfig>;
  }

  /** Direct lookup by provider UUID. */
  providerByUuid(uuid: string): ProviderConfig | undefined {
    return this.providers[uuid];
  }

  /** Resolve a provider by either its UUID or its engine family.
   *  Falls back to a direct key match for legacy family-keyed entries. */
  provider(uuidOrFamily: string): ProviderConfig {
    // 1) direct UUID hit
    if (this.providers[uuidOrFamily]) return this.providers[uuidOrFamily];
    // 2) scan for first provider whose family field matches
    const all = this.providers;
    for (const [, p] of Object.entries(all)) {
      if (p.family === uuidOrFamily) return p;
    }
    return { baseUrl: '' };
  }

  /** Returns the provider UUID for a given engine family (first match). */
  providerUuidByFamily(family: string): string | undefined {
    const all = this.providers;
    for (const [k, p] of Object.entries(all)) {
      if (p.family === family) return k;
    }
    return undefined;
  }

  get maxTokens(): number | undefined {
    const v = this.cfg().get<number>('maxTokens', 0);
    return v > 0 ? v : undefined;
  }

  get logLevel(): LogLevel {
    return this.cfg().get<LogLevel>('logLevel') || 'quiet';
  }

  get isDumpEnabled(): boolean {
    return this.logLevel === 'dump';
  }

  get stabilizeTools(): boolean {
    return this.cfg().get<boolean>('stabilizeTools', false);
  }

  /** Resolves the actual model ID to send to the provider API. */
  resolveModelId(pickerId: string, familyOrUuid: string): string {
    const p = this.provider(familyOrUuid);
    const alias = p.modelAlias?.[pickerId];
    return (alias || pickerId).trim();
  }

  /** Resolves the API path for a specific model. */
  resolveApiPath(pickerId: string, familyOrUuid: string): string {
    const p = this.provider(familyOrUuid);
    return (p.modelApiPaths?.[pickerId] || p.defaultApiPath || '/chat/completions').trim();
  }

  /** Resolves vision fallback provider for a model. */
  resolveVisionFallback(pickerId: string, familyOrUuid: string): string | undefined {
    const p = this.provider(familyOrUuid);
    return p.modelApiPaths?.[pickerId + '.vision'] || p.visionFallback || undefined;
  }

  /** Global vision fallback model ID. Format: family:modelId or just modelId. */
  get visionFallbackModel(): string {
    return this.cfg().get<string>('visionFallbackModel', '');
  }

  /** When enabled, always preprocess image inputs through the configured vision fallback model. */
  get visionFallbackAlways(): boolean {
    return this.cfg().get<boolean>('visionFallbackAlways', false);
  }

  /** Custom system prompt template. Empty = use Copilot default. */
  get systemPrompt(): string {
    return this.cfg().get<string>('systemPrompt', '');
  }

  /** Custom user prompt wrapper template. Uses {userMessage} placeholder. */
  get userPromptTemplate(): string {
    return this.cfg().get<string>('userPromptTemplate', '');
  }
}
