import vscode from 'vscode';

export interface ProviderConfig {
  name?: string;
  baseUrl: string;
  defaultApiPath?: string;
  modelApiPaths?: Record<string, string>;
  modelAlias?: Record<string, string>;
}

export type LogLevel = 'quiet' | 'meta' | 'dump';

/** Per‑family provider config. Single source of truth for all settings. */
export class Tuning {
  private cfg = () => vscode.workspace.getConfiguration('copilot-adapter-kit');

  /** All registered provider configs keyed by family name. */
  get providers(): Record<string, ProviderConfig> {
    return this.cfg().get<Record<string, ProviderConfig>>('providers') || {};
  }

  /** Look up a single provider's config. Falls back to empty config. */
  provider(family: string): ProviderConfig {
    return this.providers[family] || { baseUrl: '' };
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
  resolveModelId(pickerId: string, family: string): string {
    const alias = this.provider(family).modelAlias?.[pickerId];
    return (alias || pickerId).trim();
  }

  /** Resolves the API path for a specific model. Falls back: model override → provider default → /chat/completions. */
  resolveApiPath(pickerId: string, family: string): string {
    const p = this.provider(family);
    return (p.modelApiPaths?.[pickerId] || p.defaultApiPath || '/chat/completions').trim();
  }
}
