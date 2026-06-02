// SettingsPanel — webview panel with Daakia-styled form UI
// Singleton panel, opens from status bar or command palette.
import { readFileSync } from 'fs';
import { join } from 'path';
import vscode from 'vscode';
import { BUILTIN_CATALOG } from '../conduit/model-catalog';

export class SettingsPanel {
  static current: SettingsPanel | undefined;
  private panel: vscode.WebviewPanel;

  private constructor(private ext: vscode.ExtensionContext) {
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
          await this._setApiKey(msg.payload?.family, msg.payload?.key);
          break;
        case 'clearApiKey':
          await this._clearApiKey(msg.payload?.family);
          break;
        case 'saveConfig':
          await this._saveConfig(msg.payload?.key, msg.payload?.value);
          break;
        case 'saveProvider':
          await this._saveProvider(msg.payload?.family, msg.payload?.config);
          break;
        case 'removeProvider':
          await this._removeProvider(msg.payload?.family);
          break;
        case 'saveModel':
          await this._saveModel(msg.payload);
          break;
        case 'removeModel':
          await this._removeModel(msg.payload?.id, msg.payload?.family);
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
      }
    });
  }

  static show(ext: vscode.ExtensionContext): void {
    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal();
    } else {
      SettingsPanel.current = new SettingsPanel(ext);
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
    const models = config.get<any[]>('models') || [];
    const maxTokens = config.get<number>('maxTokens', 0);
    const logLevel = config.get<string>('logLevel', 'quiet');
    const stabilizeTools = config.get<boolean>('stabilizeTools', false);
    const showBuiltinModels = config.get<boolean>('showBuiltinModels', true);
    const hiddenBuiltins: string[] = config.get<string[]>('hiddenBuiltins') || [];
    const modelOverrides: Record<string, any> = config.get<Record<string, any>>('modelOverrides') || {};
    const hiddenCustomModels: string[] = config.get<string[]>('hiddenCustomModels') || [];

    // Merge overrides into built-in models
    const builtinModels = BUILTIN_CATALOG.map(m => {
      const ov = modelOverrides[m.id];
      return ov ? { ...m, ...ov } : m;
    });

    // Per-family keys — only check the registered families
    const keys: Record<string, boolean> = {};
    for (const [fam, p] of Object.entries(providers)) {
      try {
        const k = await this.ext.secrets.get(`copilot-adapter-kit.apiKey.${fam}`);
        keys[fam] = !!k;
      } catch { keys[fam] = false; }
    }

    this.panel.webview.postMessage({
      type: 'state',
      payload: {
        providers, models, maxTokens, logLevel, stabilizeTools, showBuiltinModels, hiddenBuiltins, hiddenCustomModels, modelOverrides, keys,
        builtinModels,
      },
    });
  }

  private async _setApiKey(family: string, key: string): Promise<void> {
    await this.ext.secrets.store(`copilot-adapter-kit.apiKey.${family}`, key.trim());
    // secrets.onDidChange fires automatically → bridge refreshes
    await this._sendState();
  }

  private async _clearApiKey(family: string): Promise<void> {
    await this.ext.secrets.delete(`copilot-adapter-kit.apiKey.${family}`);
    // secrets.onDidChange fires automatically
    await this._sendState();
  }

  private async _saveConfig(key: string, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    await config.update(key, value, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _saveProvider(family: string, providerConfig: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = config.get<Record<string, any>>('providers') || {};
    providers[family] = providerConfig;
    await config.update('providers', providers, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _removeProvider(family: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = config.get<Record<string, any>>('providers') || {};
    delete providers[family];
    await config.update('providers', providers, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _saveModel(entry: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const existing = (config.get<any[]>('models') || []) as any[];
    const idx = existing.findIndex((m: any) => m?.id === entry.id && m?.family === entry.family);
    if (idx >= 0) { existing[idx] = entry; }
    else { existing.push(entry); }
    await config.update('models', existing, vscode.ConfigurationTarget.Global);
    await this._sendState();
  }

  private async _removeModel(id: string, family: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const existing = (config.get<any[]>('models') || []) as any[];
    const updated = existing.filter((m: any) => !(m?.id === id && m?.family === family));
    await config.update('models', updated, vscode.ConfigurationTarget.Global);
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
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const existing = (config.get<any[]>('models') || []) as any[];
    const idx = existing.findIndex((m: any) => m?.id === id && m?.family === family);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], apiPath: apiPath || undefined };
      await config.update('models', existing, vscode.ConfigurationTarget.Global);
    }
    await this._sendState();
  }
}
