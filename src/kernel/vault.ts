import vscode from 'vscode';

const PREFIX = 'copilot-adapter-kit.apiKey';

export class Vault {
  constructor(private store: vscode.SecretStorage) {}

  private _key(family: string): string { return `${PREFIX}.${family}`; }

  /** Fetch key for a specific family. No fallback — every provider must have its own key. */
  async fetch(family: string): Promise<string | undefined> {
    return (await this.store.get(this._key(family))) || undefined;
  }

  /** Store key for a specific family. */
  async seal(family: string, apiKey: string): Promise<void> {
    await this.store.store(this._key(family), apiKey.trim());
  }

  /** Remove key for a specific family. */
  async revoke(family: string): Promise<void> {
    await this.store.delete(this._key(family));
  }

  /** Check if at least one provider has a key configured. */
  async present(): Promise<boolean> {
    // Quick check: try the openai key (most common). Full scan is expensive on SecretStorage.
    const k = await this.fetch('openai');
    return k !== undefined && k.length > 0;
  }
}
