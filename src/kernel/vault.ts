import vscode from 'vscode';

const PREFIX = 'copilot-adapter-kit.apiKey';

export class Vault {
  constructor(private store: vscode.SecretStorage) {}

  /** Fetch key for a provider UUID. */
  async fetch(uuid: string): Promise<string | undefined> {
    return (await this.store.get(`${PREFIX}.${uuid}`)) || undefined;
  }

  /** Store key for a provider UUID. */
  async seal(uuid: string, apiKey: string): Promise<void> {
    await this.store.store(`${PREFIX}.${uuid}`, apiKey.trim());
  }

  /** Remove key for a provider UUID. */
  async revoke(uuid: string): Promise<void> {
    await this.store.delete(`${PREFIX}.${uuid}`);
  }

  /** Check if at least one configured provider has a key. */
  async present(): Promise<boolean> {
    const providers = vscode.workspace.getConfiguration('copilot-adapter-kit').get<Record<string, any>>('providers') || {};
    const uuids = Object.keys(providers).filter(k => providers[k] && !providers[k]._deleted);
    const keys = await Promise.all(uuids.map(u => this.store.get(`${PREFIX}.${u}`)));
    return keys.some(k => k !== undefined && k.length > 0);
  }
}
