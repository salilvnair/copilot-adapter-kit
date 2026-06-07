// MiniGitPanel — reads HTML from media/mini-git-panel.html (same pattern as SettingsPanel)
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import vscode from 'vscode';
import { resolveCatalog } from '../conduit/model-catalog';
import { Context } from '../kernel/context';
import type { Payload, StreamEvents } from '../mesh/contract';

export class MiniGitPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(private ext: vscode.ExtensionContext, private ctx: Context) {}

  resolveWebviewView(wv: vscode.WebviewView): void {
    this.view = wv;
    wv.webview.options = { enableScripts: true };
    wv.webview.html = this._html();
    wv.webview.onDidReceiveMessage(async (m: { type: string; payload?: any }) => {
      if (m.type === 'getData') { this._sendProvidersAndModels(); await this._refreshGit(); }
      else if (m.type === 'generate') await this._generate(m.payload?.family, m.payload?.modelId, m.payload?.userMsg);
    });
    setTimeout(() => { this._refreshGit(); this._sendProvidersAndModels(); }, 300);
  }

  private _html(): string {
    try { return readFileSync(join(this.ext.extensionPath, 'media', 'mini-git-panel.html'), 'utf-8'); }
    catch { return '<html><body style="color:#d4d4d4;background:#1e1e1e;padding:24px"><h2>Panel not found</h2></body></html>'; }
  }

  private _runGit(args: string): Promise<string> {
    return new Promise(r => exec(`git ${args}`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, maxBuffer: 10*1024*1024 }, (e, o) => r(e ? '' : o)));
  }

  private _sendProvidersAndModels(): void {
    const cfg = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const pv = cfg.get<Record<string, any>>('providers') || {};
    const fams = Object.keys(pv).map(f => ({ family: f, name: pv[f].name || f }));
    this.view?.webview.postMessage({ type: 'providers', payload: { families: fams } });
    const cat = resolveCatalog();
    const mb: Record<string, { id: string; name: string }[]> = {};
    for (const fam of fams) mb[fam.family] = cat.filter(m => m.family === fam.family).map(m => ({ id: m.id, name: m.name }));
    this.view?.webview.postMessage({ type: 'models', payload: { modelsByFamily: mb } });
  }

  private async _refreshGit(): Promise<void> {
    if (!this.view) return;
    try {
      const br = (await this._runGit('rev-parse --abbrev-ref HEAD')).trim();
      const rp = (await this._runGit('rev-parse --show-toplevel')).trim().split('/').pop() || '';
      const st = (await this._runGit('status --short')).trim();
      const sc = (await this._runGit('diff --cached --name-only')).trim().split('\n').filter(Boolean).length;
      const uc = (await this._runGit('diff --name-only')).trim().split('\n').filter(Boolean).length;
      this.view.webview.postMessage({ type: 'gitData', payload: { branch: br, repo: rp, statusShort: st, stagedCount: sc, unstagedCount: uc } });
    } catch { this.view.webview.postMessage({ type: 'gitData', payload: {} }); }
  }

  private async _generate(chosenFamily?: string, chosenModel?: string, userMsg?: string): Promise<void> {
    if (!this.view || !this.ctx) return;
    const cfg = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const pv = cfg.get<Record<string, any>>('providers') || {};
    const fams = Object.keys(pv);
    if (!fams.length) { this.view.webview.postMessage({ type: 'genResult', payload: { error: 'No providers configured.' } }); return; }
    const family = (chosenFamily && pv[chosenFamily]) ? chosenFamily : fams[0];
    const prov = pv[family];
    const key = await this.ext.secrets.get(`copilot-adapter-kit.apiKey.${family}`);
    if (!key) { this.view.webview.postMessage({ type: 'genResult', payload: { error: `No API key for "${prov.name || family}".` } }); return; }
    try {
      const staged = (await this._runGit('diff --cached')).trim();
      const unstaged = (await this._runGit('diff')).trim();
      const diff = [staged, unstaged].filter(Boolean).join('\n\n');
      if (!diff) { this.view.webview.postMessage({ type: 'genResult', payload: { error: 'No changes found.' } }); return; }
      const engine = this.ctx.discovery.lookup(family);
      engine.configure?.(prov.baseUrl, key);
      const branch = (await this._runGit('rev-parse --abbrev-ref HEAD')).trim();
      const repo = (await this._runGit('rev-parse --show-toplevel')).trim().split('/').pop() || '';
      const gpc = cfg.get<string>('gitPrompt', '');
      const dp = `You are an expert Git commit message writer. Generate a **comprehensive conventional commit message** using Markdown.\n\n**Requirements:**\n1. First line: type(scope): short summary (max 72 chars)\n2. Blank line\n3. **## Summary** section\n4. **## Changes** bullet points\n5. **## Impact** section\n6. Use **bold** for file names and inline code for symbols\n\nBranch: {branch}\nRepo: {repo}\n{guidance}\n--- DIFF ---\n{diff}\n\nGenerate only the commit message.`;
      const guidance = userMsg?.trim() ? `User guidance: ${userMsg}\n\n` : '';
      const prompt = (gpc || dp).replace(/\{branch\}/g, branch).replace(/\{repo\}/g, repo).replace(/\{diff\}/g, diff).replace(/\{guidance\}/g, guidance);
      const cat = resolveCatalog();
      const fms = cat.filter(m => m.family === family);
      const model = (chosenModel && chosenModel !== 'auto' && chosenModel !== '') ? chosenModel : (fms.length > 0 ? fms[0].id : 'gpt-4o');
      const ap = prov.defaultApiPath || '/chat/completions';
      const payload: Payload = { model, messages: [{ role: 'user', content: prompt }], stream: true, max_tokens: 2048, apiPath: ap };
      const wrapped = this.ctx.pipeline.wrap(engine);
      let text = '', settled = false;
      const done = (r: { text?: string; error?: string }) => { if (settled) return; settled = true; this.view?.webview.postMessage({ type: 'genResult', payload: { ...r, provider: prov.name || family, model } }); };
      const sink: StreamEvents = {
        onToken: t => { text += t; this.view?.webview.postMessage({ type: 'genToken', payload: t }); },
        onThinking: () => {}, onToolSignal: () => {},
        onFault: async e => done(text.trim() ? { text: text.trim() } : { error: e.message || String(e) }),
        onComplete: () => done(text.trim() ? { text: text.trim() } : { error: 'LLM returned empty response.' }),
      };
      await wrapped.stream(payload, sink);
      if (!settled) done({ error: 'No response from LLM.' });
    } catch (e: any) { this.view.webview.postMessage({ type: 'genResult', payload: { error: e.message || String(e) } }); }
  }
}
