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

  /** Check if at least one configured provider has a key. */
  async present(): Promise<boolean> {
    // Check all keys — user may not use 'openai' at all
    const keys = await Promise.all(
      Object.keys(vscode.workspace.getConfiguration('copilot-adapter-kit').get<Record<string, unknown>>('providers') || {})
        .map(f => this.fetch(f))
    );
    return keys.some(k => k !== undefined && k.length > 0);
  }
}
