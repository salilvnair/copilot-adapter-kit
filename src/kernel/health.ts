// ProviderHealth — what the panel can honestly say about a provider.
//
// Two different signals, deliberately kept apart:
//
//   Reachability is probed, and the probe never carries a key. A provider that
//   answers 401 is reachable — that tells us the endpoint is real, which is the
//   question being asked.
//
//   Key validity is not probed at all. It is recorded from responses to real
//   requests: a 401 during actual use means the stored key is bad, and that is
//   the only evidence that does not involve sending the key somewhere to ask.

import vscode from 'vscode';

const STORE_KEY = 'cak.health.v1';
const PROBE_TIMEOUT_MS = 4000;

export interface HealthRecord {
  /** The endpoint answered at all — any HTTP status, 401 included. */
  reachable: boolean;
  /** Round trip in milliseconds. */
  ms?: number;
  status?: number;
  /** When a real request was last rejected for authentication. */
  authFailedAt?: number;
  checkedAt?: number;
}

export class ProviderHealth {
  private records: Record<string, HealthRecord>;

  constructor(private ext: vscode.ExtensionContext) {
    this.records = ext.globalState.get<Record<string, HealthRecord>>(STORE_KEY) ?? {};
  }

  get all(): Record<string, HealthRecord> {
    return this.records;
  }

  get(uuid: string): HealthRecord | undefined {
    return this.records[uuid];
  }

  /** A real request came back 401/403 — the stored key is bad. */
  recordAuthFailure(uuid: string): void {
    this._merge(uuid, { authFailedAt: Date.now() });
  }

  /** A real request succeeded, so whatever was wrong with the key is fixed. */
  recordSuccess(uuid: string): void {
    const prev = this.records[uuid];
    if (!prev?.authFailedAt) return;
    const { authFailedAt: _dropped, ...rest } = prev;
    this.records[uuid] = { ...rest, reachable: true, checkedAt: Date.now() };
    void this._flush();
  }

  /**
   * Probe an endpoint without a key. Any HTTP answer counts as reachable; only
   * a transport failure or a timeout counts as down.
   */
  async probe(uuid: string, baseUrl: string): Promise<HealthRecord> {
    const url = `${baseUrl.replace(/\/$/, '')}/models`;
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

    let record: HealthRecord;
    try {
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
      record = { reachable: true, ms: Date.now() - started, status: res.status, checkedAt: Date.now() };
      // A probe that comes back 401 says the endpoint is fine and the key is
      // the problem — but only if we actually have a key stored for it.
      if (res.status === 401 || res.status === 403) record.status = res.status;
    } catch {
      record = { reachable: false, checkedAt: Date.now() };
    } finally {
      clearTimeout(timer);
    }

    this._merge(uuid, record);
    return this.records[uuid];
  }

  /** Probe every provider that has a base URL. */
  async probeAll(providers: Record<string, { baseUrl?: string; _deleted?: boolean }>): Promise<void> {
    await Promise.all(
      Object.entries(providers)
        .filter(([, p]) => p && !p._deleted && p.baseUrl)
        .map(([uuid, p]) => this.probe(uuid, p.baseUrl!)),
    );
  }

  /** Is anything listening on the default Ollama port? Used by the first run. */
  async probeOllama(): Promise<void> {
    await this.probe('probe:ollama', 'http://localhost:11434/v1');
  }

  private _merge(uuid: string, patch: Partial<HealthRecord>): void {
    const prev = this.records[uuid] ?? { reachable: false };
    this.records[uuid] = { ...prev, ...patch };
    void this._flush();
  }

  private _flush(): Thenable<void> {
    return this.ext.globalState.update(STORE_KEY, this.records);
  }
}
