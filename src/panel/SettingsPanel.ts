// SettingsPanel — webview panel with Daakia-styled form UI
// Singleton panel, opens from status bar or command palette.
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import vscode from 'vscode';
import { BUILTIN_CATALOG } from '../conduit/model-catalog';
import { KNOWN_FAMILIES } from '../kernel/families';
import { Context } from '../kernel/context';
import type { Payload, StreamEvents } from '../mesh/contract';

export class SettingsPanel {
  static current: SettingsPanel | undefined;
  private panel: vscode.WebviewPanel;
  private ctx: Context | undefined;

  private constructor(private ext: vscode.ExtensionContext, ctx?: Context) {
    this.ctx = ctx;
    this.panel = vscode.window.createWebviewPanel(
      'cak.settingsPanel',
      'Copilot Adapter Kit',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(join(ext.extensionPath, 'media')),
          vscode.Uri.file(join(ext.extensionPath, 'resources')),
        ],
      },
    );

    this.panel.iconPath = vscode.Uri.file(join(ext.extensionPath, 'resources', 'icon.png'));
    const iconUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(join(ext.extensionPath, 'resources', 'icon.png'))
    );
    const csp = `default-src 'none'; img-src ${this.panel.webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:;`;
    this.panel.webview.html = this._html()
      .replace('__CSP__', csp)
      .replace('__ICON_URI__', iconUri.toString());
    this.panel.onDidDispose(() => { SettingsPanel.current = undefined; });

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(async (msg: { type: string; payload?: any }) => {
      switch (msg.type) {
        case 'getState':
          await this._sendState();
          break;
        case 'setApiKey':
          await this._setApiKey(msg.payload?.uuid, msg.payload?.key);
          break;
        case 'clearApiKey':
          await this._clearApiKey(msg.payload?.uuid);
          break;
        case 'saveConfig':
          await this._saveConfig(msg.payload?.key, msg.payload?.value);
          break;
        case 'saveProvider':
          await this._saveProvider(msg.payload?.uuid, msg.payload?.config);
          break;
        case 'duplicateProvider':
          await this._duplicateProvider(msg.payload?.uuid);
          break;
        case 'removeProvider':
          await this._removeProvider(msg.payload?.uuid);
          break;
        case 'saveModel':
          await this._saveModel(msg.payload);
          break;
        case 'removeModel':
          await this._removeModel(msg.payload?.parentUuid, msg.payload?.uuid);
          break;
        case 'restoreProvider':
          await this._restoreProvider(msg.payload?.uuid);
          break;
        case 'restoreModel':
          await this._restoreModel(msg.payload?.parentUuid, msg.payload?.uuid);
          break;
        case 'permDeleteProvider':
          await this._permDeleteProvider(msg.payload?.uuid);
          break;
        case 'permDeleteModel':
          await this._permDeleteModel(msg.payload?.parentUuid, msg.payload?.uuid);
          break;
        case 'clearBin':
          await this._clearBin();
          break;
        case 'toggleBuiltin':
          await this._toggleBuiltin(msg.payload?.id);
          break;
        case 'toggleCustom':
          await this._toggleCustom(msg.payload?.id, msg.payload?.family);
          break;
        case 'editBuiltin':
          await this._editBuiltin(msg.payload);
          break;
        case 'deleteBuiltin':
          await this._deleteBuiltin(msg.payload?.id);
          break;
        case 'updateModelApiPath':
          await this._updateModelApiPath(msg.payload?.id, msg.payload?.family, msg.payload?.apiPath);
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', '@ext:salilvnair.copilot-adapter-kit');
          break;
        case 'openDumps':
          vscode.commands.executeCommand('copilot-adapter-kit.openDumps');
          break;
        case 'deleteAll':
          await this._deleteAll();
          break;
        case 'factoryReset':
          await this._factoryReset();
          break;
        case 'execGit':
          await this._execGit();
          break;
        case 'execAndGen':
          await this._execAndGen(msg.payload?.which, msg.payload?.family);
          break;
        case 'genCommitMsg':
          await this._genCommitMsg(msg.payload?.diff, msg.payload?.family);
          break;
      }
    });
  }

  static show(ext: vscode.ExtensionContext, ctx?: Context): void {
    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal();
    } else {
      SettingsPanel.current = new SettingsPanel(ext, ctx);
    }
  }

  private _html(): string {
    try {
      const p = join(this.ext.extensionPath, 'media', 'settings-panel.html');
      return readFileSync(p, 'utf-8');
    } catch {
      return `<html><body style="color:#d4d4d4;background:#1e1e1e;padding:24px;">
        <h2>Panel not found</h2><p>Run <code>npm run compile</code> and reload.</p></body></html>`;
    }
  }

  private async _sendState(): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = config.get<Record<string, any>>('providers') || {};
    const models = config.get<Record<string, any[]>>('models') || {};
    const maxTokens = config.get<number>('maxTokens', 0);
    const logLevel = config.get<string>('logLevel', 'quiet');
    const stabilizeTools = config.get<boolean>('stabilizeTools', false);
    const hiddenBuiltins: string[] = config.get<string[]>('hiddenBuiltins') || [];
    const modelOverrides: Record<string, any> = config.get<Record<string, any>>('modelOverrides') || {};
    const hiddenCustomModels: string[] = config.get<string[]>('hiddenCustomModels') || [];
    const visionFallbackModel: string = config.get<string>('visionFallbackModel', '');
    const visionFallbackAlways: boolean = config.get<boolean>('visionFallbackAlways', false);
    const systemPrompt: string = config.get<string>('systemPrompt', '');
    const userPromptTemplate: string = config.get<string>('userPromptTemplate', '');
    const gitPrompt: string = config.get<string>('gitPrompt', '');
    const maxDiffFiles: number = config.get<number>('maxDiffFiles', 500);

    // Merge overrides into built-in models
    const builtinModels = BUILTIN_CATALOG.map(m => {
      const ov = modelOverrides[m.id];
      return ov ? { ...m, ...ov } : m;
    });

    // Discover ALL registered chat models (Copilot + CAK + any other provider).
    // Empty filter {} = query everything — same approach ck8t uses.
    let copilotModels: { id: string; name: string; family: string; vendor: string; image: boolean }[] = [];
    try {
      const all = await vscode.lm.selectChatModels({});
      copilotModels = all.map(m => ({
        id: m.id, name: m.name, family: m.family,
        vendor: (m as any).vendor || m.family,
        image: (m as any).capabilities?.imageInput ?? true,
      }));
    } catch {
      copilotModels = [
        { id: 'auto', name: 'Auto', family: 'copilot', vendor: 'copilot', image: true },
      ];
    }

    // Per-provider keys — keyed by provider UUID
    const keys: Record<string, boolean> = {};
    for (const [k, p] of Object.entries(providers)) {
      try {
        const keyId = `copilot-adapter-kit.apiKey.${k}`;
        const keyVal = await this.ext.secrets.get(keyId);
        keys[k] = !!keyVal;
      } catch { keys[k] = false; }
    }

    this.panel.webview.postMessage({
      type: 'state',
      payload: {
        providers, models, maxTokens, logLevel, stabilizeTools, hiddenBuiltins, hiddenCustomModels, modelOverrides, keys,
        visionFallbackModel, visionFallbackAlways, systemPrompt, userPromptTemplate, gitPrompt, maxDiffFiles,
        builtinModels, copilotModels,
        engineFamilies: KNOWN_FAMILIES.map(f => ({ family: f.family, label: f.label, defaultUrl: f.defaultUrl, desc: f.desc })),
      },
    });
  }

  private async _setApiKey(uuid: string, key: string): Promise<void> {
    const keyId = `copilot-adapter-kit.apiKey.${uuid}`;
    await this.ext.secrets.store(keyId, key.trim());
    await this._sendState();
  }

  private async _clearApiKey(uuid: string): Promise<void> {
    const keyId = `copilot-adapter-kit.apiKey.${uuid}`;
    await this.ext.secrets.delete(keyId);
    await this._sendState();
  }

  private async _saveConfig(key: string, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    await config.update(key, value, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private _uuid(): string { return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

  private _copyName(name: string): string {
    return /\s\(copy\)$/i.test(name) ? name : `${name} (copy)`;
  }

  // ---- model helpers (map-of-arrays storage) ----

  private _modelsMap(): Record<string, any[]> {
    const raw = vscode.workspace.getConfiguration('copilot-adapter-kit').get<unknown>('models');
    if (!raw || Array.isArray(raw)) return {}; // migrate legacy array → empty map
    if (typeof raw === 'object') return raw as Record<string, any[]>;
    return {};
  }

  private async _saveModelsMap(map: Record<string, any[]>): Promise<void> {
    await vscode.workspace.getConfiguration('copilot-adapter-kit')
      .update('models', map, vscode.ConfigurationTarget.Global);
  }

  /** Find a model by uuid or _key. Returns [parentUuid, indexInArray] or null. */
  private _findModel(uuidOrKey: string): [string, number] | null {
    const map = this._modelsMap();
    for (const [puid, arr] of Object.entries(map)) {
      if (!Array.isArray(arr)) continue;
      const idx = arr.findIndex((m: any) => m?.uuid === uuidOrKey || m?._key === uuidOrKey);
      if (idx >= 0) return [puid, idx];
    }
    return null;
  }

  // ---- provider CRUD ----

  private async _saveProvider(uuid: string, providerConfig: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = { ...(config.get<Record<string, any>>('providers') || {}) };
    const key = uuid || this._uuid();
    const existing = providers[key];
    providers[key] = {
      ...providerConfig,
      uuid: key,
      family: providerConfig.family || existing?.family || '',
    };
    await config.update('providers', providers, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _duplicateProvider(uuid: string): Promise<void> {
    if (!uuid) return;
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = { ...(config.get<Record<string, any>>('providers') || {}) };
    const source = providers[uuid];
    if (!source) { await this._sendState(); return; }

    const newUuid = this._uuid();
    providers[newUuid] = {
      ...source,
      uuid: newUuid,
      name: this._copyName(source.name || source.family || uuid),
      family: source.family || '',
      _deleted: false,
    };
    delete (providers[newUuid] as any).engineFamily;
    await config.update('providers', providers, vscode.ConfigurationTarget.Global);

    // Clone child models into new parentUuid bucket
    const raw = config.get<Record<string,any[]>>('models');
    const map: Record<string,any[]> = (raw && !Array.isArray(raw) && typeof raw === 'object') ? { ...raw } : {};
    const srcArr = map[uuid] || [];
    const toClone = srcArr.filter((m: any) => m && !m._deleted);
    if (toClone.length > 0) {
      const clones = toClone.map((m: any) => ({
        ...m,
        uuid: this._uuid(),
        _key: this._uuid(),
        _deleted: false,
        name: this._copyName(m.name || m.id),
      }));
      map[newUuid] = clones;
      await config.update('models', map, vscode.ConfigurationTarget.Global);
    }
    await this._sendState();
  }

  private async _removeProvider(uuid: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = { ...(config.get<Record<string,any>>('providers') || {}) };
    const prov = providers[uuid];
    if (prov) {
      providers[uuid] = { ...prov, _deleted: true };
      await config.update('providers', providers, vscode.ConfigurationTarget.Global);
      // Cascade soft-delete child models
      const raw = config.get<Record<string,any[]>>('models');
      if (raw && !Array.isArray(raw) && typeof raw === 'object') {
        const map = { ...raw };
        const arr = map[uuid];
        if (arr) {
          map[uuid] = arr.map((m: any) => m ? { ...m, _deleted: true } : m);
          await config.update('models', map, vscode.ConfigurationTarget.Global);
        }
      }
    }
    await this._sendState();
  }

  // ---- model CRUD (map-of-arrays) ----

  private async _saveModel(entry: any): Promise<void> {
    const parentUuid = entry.parentUuid || entry._provUuid;
    if (!parentUuid) {
      vscode.window.showErrorMessage('CAK: Cannot save model — no provider selected.');
      await this._sendState();
      return;
    }

    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const raw = config.get<Record<string,any[]>>('models');
    const map: Record<string,any[]> = (raw && !Array.isArray(raw) && typeof raw === 'object') ? { ...raw } : {};
    const arr = [...(map[parentUuid] || [])];

    // Find existing by uuid > _key
    let idx = entry.uuid ? arr.findIndex((m: any) => m?.uuid === entry.uuid) : -1;
    if (idx < 0 && entry._key) idx = arr.findIndex((m: any) => m?._key === entry._key);
    if (idx < 0 && !entry._key) {
      idx = arr.findIndex((m: any) => m?.id === entry.id && m?.family === entry.family);
    }

    const model = {
      ...entry,
      parentUuid,
      uuid: entry.uuid || this._uuid(),
      _key: entry._key || this._uuid(),
      _deleted: entry._deleted ?? false,
    };
    delete (model as any)._provUuid;

    if (idx >= 0) arr[idx] = model;
    else arr.push(model);

    map[parentUuid] = arr;
    await config.update('models', map, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _removeModel(parentUuid: string, uuid: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const raw = config.get<Record<string,any[]>>('models');
    if (!raw || Array.isArray(raw) || typeof raw !== 'object') return;
    const map = { ...raw };
    const arr = map[parentUuid];
    if (arr) {
      map[parentUuid] = arr.map((m: any) =>
        (m?.uuid === uuid || m?._key === uuid) ? { ...m, _deleted: true } : m
      );
      await config.update('models', map, vscode.ConfigurationTarget.Global);
    }
    await this._sendState();
  }

  private async _restoreModel(parentUuid: string, uuid: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const raw = config.get<Record<string,any[]>>('models');
    if (!raw || Array.isArray(raw) || typeof raw !== 'object') return;
    const map = { ...raw };
    const arr = map[parentUuid];
    if (arr) {
      map[parentUuid] = arr.map((m: any) =>
        (m?.uuid === uuid || m?._key === uuid) ? { ...m, _deleted: false } : m
      );
      await config.update('models', map, vscode.ConfigurationTarget.Global);
    }
    await this._sendState();
  }

  private async _permDeleteModel(parentUuid: string, uuid: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const raw = config.get<Record<string,any[]>>('models');
    if (!raw || Array.isArray(raw) || typeof raw !== 'object') return;
    const map = { ...raw };
    const arr = map[parentUuid];
    if (arr) {
      const filtered = arr.filter((m: any) => m?.uuid !== uuid && m?._key !== uuid);
      if (filtered.length) map[parentUuid] = filtered;
      else delete map[parentUuid];
      await config.update('models', map, vscode.ConfigurationTarget.Global);
    }
    await this._sendState();
  }

  private async _restoreProvider(uuid: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = { ...(config.get<Record<string,any>>('providers') || {}) };
    const prov = providers[uuid];
    if (prov) {
      providers[uuid] = { ...prov, _deleted: false };
      await config.update('providers', providers, vscode.ConfigurationTarget.Global);
      // Cascade restore child models
      const raw = config.get<Record<string,any[]>>('models');
      if (raw && !Array.isArray(raw) && typeof raw === 'object') {
        const map = { ...raw };
        const arr = map[uuid];
        if (arr) {
          map[uuid] = arr.map((m: any) => m ? { ...m, _deleted: false } : m);
          await config.update('models', map, vscode.ConfigurationTarget.Global);
        }
      }
    }
    await this._sendState();
  }

  private async _permDeleteProvider(uuid: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = { ...(config.get<Record<string,any>>('providers') || {}) };
    delete providers[uuid];
    await config.update('providers', providers, vscode.ConfigurationTarget.Global);
    // Remove child models
    const raw = config.get<Record<string,any[]>>('models');
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      const map = { ...raw };
      delete map[uuid];
      await config.update('models', map, vscode.ConfigurationTarget.Global);
    }
    // Remove API key
    try { await this.ext.secrets.delete(`copilot-adapter-kit.apiKey.${uuid}`); } catch { /* ok */ }
    await this._sendState();
  }

  private async _clearBin(): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');

    // Providers: keep only non-deleted
    const providers = config.get<Record<string, any>>('providers') || {};
    const cleanedProv: Record<string, any> = {};
    for (const [k, v] of Object.entries(providers)) {
      if (v && !v._deleted) cleanedProv[k] = v;
    }
    await config.update('providers', cleanedProv, vscode.ConfigurationTarget.Global);

    // Models: keep only non-deleted entries in each bucket, drop empty buckets
    const raw = config.get<Record<string, any[]>>('models');
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      const cleanedMod: Record<string, any[]> = {};
      for (const [puid, arr] of Object.entries(raw)) {
        if (!Array.isArray(arr)) continue;
        const filtered = arr.filter((m: any) => m && !m._deleted);
        if (filtered.length) cleanedMod[puid] = filtered;
      }
      await config.update('models', cleanedMod, vscode.ConfigurationTarget.Global);
    } else {
      // Legacy array or missing — just set to empty map
      await config.update('models', {}, vscode.ConfigurationTarget.Global);
    }

    await this._sendState();
  }

  private async _toggleBuiltin(id: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const hidden: string[] = config.get<string[]>('hiddenBuiltins') || [];
    const idx = hidden.indexOf(id);
    if (idx >= 0) { hidden.splice(idx, 1); }
    else { hidden.push(id); }
    await config.update('hiddenBuiltins', hidden, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _toggleCustom(id: string, family: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const hidden: string[] = config.get<string[]>('hiddenCustomModels') || [];
    const key = `${family}:${id}`;
    const idx = hidden.indexOf(key);
    if (idx >= 0) { hidden.splice(idx, 1); }
    else { hidden.push(key); }
    await config.update('hiddenCustomModels', hidden, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _editBuiltin(entry: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const overrides = config.get<Record<string,any>>('modelOverrides') || {};
    overrides[entry.id] = entry;
    await config.update('modelOverrides', overrides, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _deleteBuiltin(id: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const overrides = config.get<Record<string,any>>('modelOverrides') || {};
    delete overrides[id];
    await config.update('modelOverrides', overrides, vscode.ConfigurationTarget.Global);
    // Also hide it
    const hidden: string[] = config.get<string[]>('hiddenBuiltins') || [];
    if (!hidden.includes(id)) { hidden.push(id); }
    await config.update('hiddenBuiltins', hidden, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _updateModelApiPath(id: string, family: string, apiPath: string): Promise<void> {
    const map = this._modelsMap();
    for (const arr of Object.values(map)) {
      if (!Array.isArray(arr)) continue;
      const idx = arr.findIndex((m: any) => m?.id === id && m?.family === family);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], apiPath: apiPath || undefined };
        await this._saveModelsMap(map);
        break;
      }
    }
    await this._sendState();
  }

  private async _deleteAll(): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = config.get<Record<string, any>>('providers') || {};
    for (const uuid of Object.keys(providers)) {
      try { await this.ext.secrets.delete(`copilot-adapter-kit.apiKey.${uuid}`); } catch { /* ok */ }
    }
    await config.update('providers', undefined, vscode.ConfigurationTarget.Global);
    await config.update('models', undefined, vscode.ConfigurationTarget.Global);
    await config.update('maxTokens', undefined, vscode.ConfigurationTarget.Global);
    await config.update('logLevel', undefined, vscode.ConfigurationTarget.Global);
    await config.update('stabilizeTools', undefined, vscode.ConfigurationTarget.Global);
    await config.update('hiddenBuiltins', undefined, vscode.ConfigurationTarget.Global);
    await config.update('hiddenCustomModels', undefined, vscode.ConfigurationTarget.Global);
    await config.update('modelOverrides', undefined, vscode.ConfigurationTarget.Global);
    await this._sendState();
    vscode.window.showInformationMessage('🗑 All data deleted.');
  }

  private async _factoryReset(): Promise<void> {
    await this._deleteAll();
  }

  // --- Tools: Git ---

  private _runGit(args: string): Promise<string> {
    return new Promise((resolve) => {
      const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      exec(`git ${args}`, { cwd: wsFolder, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        resolve(err ? '' : stdout);
      });
    });
  }

  private async _execGit(): Promise<void> {
    try {
      // --cached (compatible with all Git versions) instead of --staged
      const staged = await this._runGit('diff --cached');
      const unstaged = await this._runGit('diff');
      const statusShort = await this._runGit('status --short');
      const branch = await this._runGit('rev-parse --abbrev-ref HEAD').then(s => s.trim(), () => 'unknown');
      const repo = await this._runGit('rev-parse --show-toplevel').then(s => s.trim().split('/').pop() || '', () => '');
      // If branch is empty, we're likely not in a git repo
      if (!branch && !staged && !unstaged) {
        this.panel.webview.postMessage({ type: 'gitError', payload: 'Not a git repository (or no workspace folder open).' });
        return;
      }
      this.panel.webview.postMessage({
        type: 'gitState',
        payload: { staged: staged.trim(), unstaged: unstaged.trim(), statusShort: statusShort.trim(), branch, repo },
      });
    } catch (e: any) {
      this.panel.webview.postMessage({ type: 'gitError', payload: e.message || String(e) });
    }
  }

  private async _buildDiff(which: string): Promise<{ diff: string; fileCount: number; compressed: boolean }> {
    const threshold = vscode.workspace.getConfiguration('copilot-adapter-kit').get<number>('maxDiffFiles', 500);
    const flag = which === 'staged' ? '--cached' : '';
    const files = (await this._runGit('diff ' + flag + ' --name-only')).trim().split('\n').filter(Boolean);
    // Use git status for accurate count (dedupes, matches VS Code git tab)
    const statusLines = (await this._runGit('status --porcelain')).trim().split('\n').filter(Boolean);
    const fileCount = statusLines.length;

    if (fileCount > threshold) {
      const stat = (await this._runGit('diff ' + flag + ' --stat')).trim();
      const numstat = (await this._runGit('diff ' + flag + ' --numstat')).trim();
      const label = which === 'staged' ? 'Staged' : 'Unstaged';
      const diff = [
        '## Compressed Diff (' + fileCount + ' files changed, threshold: ' + threshold + ')',
        '### ' + label + ' (' + fileCount + ' files)',
        '```',
        stat,
        '```',
        '',
        '### Numstat',
        '```',
        numstat,
        '```',
      ].join('\n');
      return { diff, fileCount, compressed: true };
    }

    const diff = (await this._runGit('diff ' + flag)).trim();
    return { diff, fileCount, compressed: false };
  }

  private async _execAndGen(which: string, chosenFamily?: string): Promise<void> {
    // Fetch git diff automatically (with compression for large changes), then call _genCommitMsg
    const { diff, fileCount, compressed } = await this._buildDiff(which);

    if (!diff) {
      const branch = (await this._runGit('rev-parse --abbrev-ref HEAD')).trim();
      if (!branch) {
        this.panel.webview.postMessage({
          type: 'genCommitMsgResult',
          payload: { error: 'Not a git repository (or no workspace folder open).' },
        });
        return;
      }
      const label = which === 'staged' ? 'staged' : 'unstaged';
      this.panel.webview.postMessage({
        type: 'genCommitMsgResult',
        payload: { error: `No ${label} changes. Stage some files first or make some edits.` },
      });
      return;
    }

    // Now generate the commit message (no gitState — user didn't click Fetch Git Status)
    await this._genCommitMsg(diff, chosenFamily, fileCount, compressed);
  }

  private async _genCommitMsg(diff: string, chosenFamily?: string, fileCount?: number, compressed?: boolean): Promise<void> {
    if (!this.ctx) {
      this.panel.webview.postMessage({ type: 'genCommitMsgResult', payload: { error: 'Context not available.' } });
      return;
    }
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = config.get<Record<string, any>>('providers') || {};
    const families = Object.keys(providers);
    if (!families.length) {
      this.panel.webview.postMessage({ type: 'genCommitMsgResult', payload: { error: 'No providers configured. Add a provider first.' } });
      return;
    }
    const family = (chosenFamily && providers[chosenFamily]) ? chosenFamily : families[0];
    const provider = providers[family];
    const providerName = provider.name || family;
    const baseUrl = provider.baseUrl || '';
    const apiPath = provider.defaultApiPath || '/chat/completions';
    const key = await this.ext.secrets.get(`copilot-adapter-kit.apiKey.${family}`);
    if (!key) {
      this.panel.webview.postMessage({ type: 'genCommitMsgResult', payload: { error: `No API key for "${providerName}". Set it in the Keys tab.` } });
      return;
    }

    try {
      const engine = this.ctx.discovery.lookup(family);
      engine.configure?.(baseUrl, key);

      const branch = await this._runGit('rev-parse --abbrev-ref HEAD').then(s => s.trim(), () => 'unknown');
      const repo = await this._runGit('rev-parse --show-toplevel').then(s => s.trim().split('/').pop() || '', () => '');

      const defaultGitPrompt = `You are an expert Git commit message writer. Analyze the following git diff and generate a concise, conventional commit message (e.g., "feat: add feature X" or "fix: resolve issue Y"). 

Include a short summary line (max 72 chars), followed by a blank line, then 1-3 bullet points of key changes.

Branch: {branch}
Repo: {repo}

--- DIFF ---
{diff}

Generate only the commit message, nothing else.`;

      const gitPromptConfig = config.get<string>('gitPrompt', '');
      const systemPromptConfig = config.get<string>('systemPrompt', '');
      const userTemplateConfig = config.get<string>('userPromptTemplate', '');

      const resolvedPrompt = (gitPromptConfig || defaultGitPrompt)
        .replace(/\{branch\}/g, branch)
        .replace(/\{repo\}/g, repo)
        .replace(/\{diff\}/g, diff);

      const modelId = this.ctx.tuning.resolveModelId('auto', family);
      // Find a suitable model from builtin catalog for this family, or fall back to first custom model
      const builtinForFamily = BUILTIN_CATALOG.filter(m => m.family === family);
      const customForFamily = (config.get<any[]>('models') || []).filter((m: any) => m.family === family);
      const actualModel = builtinForFamily.length > 0 ? builtinForFamily[0].id
        : customForFamily.length > 0 ? customForFamily[0].id
        : modelId;

      // Build messages honoring systemPrompt and userPromptTemplate from config
      const messages: any[] = [];
      if (systemPromptConfig) {
        messages.push({ role: 'system', content: systemPromptConfig });
      }
      const userContent = userTemplateConfig
        ? userTemplateConfig.replace(/\{userMessage\}/g, resolvedPrompt)
        : resolvedPrompt;
      messages.push({ role: 'user', content: userContent });

      const payload: Payload = {
        model: actualModel,
        messages,
        stream: true,
        max_tokens: 512,
        apiPath,
      };

      // Build a debug trace for the webview — show EVERYTHING so user can debug
      const threshold = vscode.workspace.getConfiguration('copilot-adapter-kit').get<number>('maxDiffFiles', 500);
      const diffNote = compressed
        ? `Diff Mode:      compressed (${fileCount} files > ${threshold} threshold)`
        : `Diff Mode:      full (${fileCount || 0} files)`;
      const trace = [
        `Provider:       ${providerName} (${family})`,
        `Base URL:       ${baseUrl}${apiPath}`,
        `Model:          ${actualModel}`,
        `Key:            ${key.slice(0, 8)}...${key.slice(-4)}`,
        `Branch:         ${branch}`,
        `Repo:           ${repo}`,
        `${diffNote}`,
        `System Prompt:  ${systemPromptConfig ? '(' + systemPromptConfig.length + ' chars) ' + systemPromptConfig : '(none — using default)'}`,
        `User Template:  ${userTemplateConfig ? '(' + userTemplateConfig.length + ' chars) ' + userTemplateConfig : '(none)'}`,
        `Git Prompt Cfg: ${gitPromptConfig ? '(' + gitPromptConfig.length + ' chars) ' + gitPromptConfig : '(none — using built-in default)'}`,
        `Final User Msg: (${userContent.length} chars) ${userContent}`,
      ];

      const wrapped = this.ctx.pipeline.wrap(engine);
      let text = '';
      const sink: StreamEvents = {
        onToken: (t: string) => { text += t; },
        onThinking: () => {},
        onToolSignal: () => {},
        onFault: async (e: Error) => {
          this.panel.webview.postMessage({
            type: 'genCommitMsgResult',
            payload: { error: e.message, trace: trace.join('\n') },
          });
        },
        onComplete: () => {
          this.panel.webview.postMessage({
            type: 'genCommitMsgResult',
            payload: { text: text.trim(), trace: trace.join('\n') },
          });
        },
      };
      await wrapped.stream(payload, sink);
    } catch (e: any) {
      this.panel.webview.postMessage({
        type: 'genCommitMsgResult',
        payload: { error: e.message || String(e), trace: `Exception during ${family} call to ${baseUrl}${apiPath}` },
      });
    }
  }
}
