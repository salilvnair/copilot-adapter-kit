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
      else if (m.type === 'generate') await this._generate(m.payload?.uuid, m.payload?.modelId, m.payload?.userMsg);
    });
    setTimeout(() => { this._refreshGit(); this._sendProvidersAndModels(); }, 300);
  }

  private _html(): string {
    try {
      let html = readFileSync(join(this.ext.extensionPath, 'media', 'mini-git-panel.html'), 'utf-8');
      // Inject MdViewer bundle as inline script (satisfies CSP)
      try {
        const bundle = readFileSync(join(this.ext.extensionPath, 'media', 'md-viewer-bundle.js'), 'utf-8');
        html = html.replace('</body>', '<script>' + bundle + '</script></body>');
      } catch { /* bundle not built yet — MdViewer unavailable */ }
      return html;
    }
    catch { return '<html><body style="color:#d4d4d4;background:#1e1e1e;padding:24px"><h2>Panel not found</h2></body></html>'; }
  }

  private _runGit(args: string): Promise<string> {
    return new Promise(r => exec(`git ${args}`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, maxBuffer: 10*1024*1024 }, (e, o) => r(e ? '' : o)));
  }

  private _sendProvidersAndModels(): void {
    const cfg = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const pv = cfg.get<Record<string, any>>('providers') || {};
    // UUID-keyed providers matching settings-panel data model
    const fams = Object.entries(pv)
      .filter(([,p]) => p && !p._deleted)
      .map(([uuid, p]) => ({ uuid, family: p.family || '', name: p.name || p.family || uuid }));
    this.view?.webview.postMessage({ type: 'providers', payload: { families: fams } });
    const cat = resolveCatalog();
    const mb: Record<string, { id: string; name: string }[]> = {};
    for (const fam of fams) {
      mb[fam.uuid] = cat.filter(m => m.family === fam.family).map(m => ({ id: m.id, name: m.name }));
    }
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

  /**
   * Build a diff payload — full diff for small changes, --stat/--numstat summary
   * for large changes to avoid hitting LLM context window limits.
   */
  private async _buildDiff(): Promise<{ diff: string; fileCount: number; compressed: boolean }> {
    const threshold = vscode.workspace.getConfiguration('copilot-adapter-kit').get<number>('maxDiffFiles', 500);
    const stagedFiles = (await this._runGit('diff --cached --name-only')).trim().split('\n').filter(Boolean);
    const unstagedFiles = (await this._runGit('diff --name-only')).trim().split('\n').filter(Boolean);
    const totalFiles = stagedFiles.length + unstagedFiles.length;

    if (totalFiles > threshold) {
      const parts: string[] = [];
      parts.push('## Compressed Diff (' + totalFiles + ' files changed, threshold: ' + threshold + ')');
      if (stagedFiles.length) {
        const stat = (await this._runGit('diff --cached --stat')).trim();
        const numstat = (await this._runGit('diff --cached --numstat')).trim();
        parts.push('### Staged (' + stagedFiles.length + ' files)\n```\n' + stat + '\n```\n\n### Numstat\n```\n' + numstat + '\n```');
      }
      if (unstagedFiles.length) {
        const stat = (await this._runGit('diff --stat')).trim();
        const numstat = (await this._runGit('diff --numstat')).trim();
        parts.push('### Unstaged (' + unstagedFiles.length + ' files)\n```\n' + stat + '\n```\n\n### Numstat\n```\n' + numstat + '\n```');
      }
      return { diff: parts.join('\n\n'), fileCount: totalFiles, compressed: true };
    }

    const staged = (await this._runGit('diff --cached')).trim();
    const unstaged = (await this._runGit('diff')).trim();
    const diff = [staged, unstaged].filter(Boolean).join('\n\n');
    return { diff, fileCount: totalFiles, compressed: false };
  }

  private async _generate(chosenUuid?: string, chosenModel?: string, userMsg?: string): Promise<void> {
    if (!this.view || !this.ctx) return;
    const cfg = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const pv = cfg.get<Record<string, any>>('providers') || {};
    if (!Object.keys(pv).length) { this.view.webview.postMessage({ type: 'genResult', payload: { error: 'No providers configured.' } }); return; }
    const uuid = (chosenUuid && pv[chosenUuid]) ? chosenUuid : Object.keys(pv).find(k => pv[k] && !pv[k]._deleted) || Object.keys(pv)[0];
    const prov = pv[uuid];
    const family = prov.family || uuid;
    const key = await this.ext.secrets.get(`copilot-adapter-kit.apiKey.${uuid}`);
    if (!key) { this.view.webview.postMessage({ type: 'genResult', payload: { error: `No API key for "${prov.name || family}".` } }); return; }
    try {
      const { diff, fileCount, compressed } = await this._buildDiff();
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
      const baseUrl = prov.baseUrl || '';
      const apiPath = ap;
      const payload: Payload = { model, messages: [{ role: 'user', content: prompt }], stream: true, max_tokens: 2048, apiPath: ap };
      const wrapped = this.ctx.pipeline.wrap(engine);
      let text = '', settled = false;
      const sysP = cfg.get<string>('systemPrompt', '');
      const usrT = cfg.get<string>('userPromptTemplate', '');
      const spDisp = sysP ? '\n\n```\n' + sysP.slice(0,800) + (sysP.length>800?'\n... (truncated)':'') + '\n```' : '\n\n*(none configured)*';
      const utDisp = usrT ? '\n\n```\n' + usrT.slice(0,600) + (usrT.length>600?'\n... (truncated)':'') + '\n```' : '\n\n*(none configured)*';
      const gpDisp = gpc ? '\n\n```\n' + gpc.slice(0,600) + (gpc.length>600?'\n... (truncated)':'') + '\n```' : '\n\n*(built-in default)*';
      const promptPreview = prompt.length>1200 ? prompt.slice(0,1200)+'\n\n... *(truncated, '+prompt.length+' chars total)*' : prompt;
      const diffNote = compressed ? `\n| **Diff Mode** | compressed (${fileCount} files > ${vscode.workspace.getConfiguration('copilot-adapter-kit').get<number>('maxDiffFiles', 500)} threshold) |` : `\n| **Diff Mode** | full (${fileCount} files) |`;
      const trace = [
        '# 🔬 Request Inspector',
        '',
        '| Property | Value |',
        '|----------|-------|',
        '| **Provider** | `' + (prov.name || family) + '` |',
        '| **Model** | `' + model + '` |',
        '| **Base URL** | `' + baseUrl + apiPath + '` |',
        '| **API Key** | `' + key.slice(0,8) + '...' + key.slice(-4) + '` |',
        '| **Branch** | `' + branch + '` |',
        '| **Repo** | `' + repo + '` |',
        '| **User Guidance** | ' + (userMsg?.trim() || '*(none)*') + ' |',
        '| **Files Changed** | ' + fileCount + ' |',
        '',
        '---',
        '## 🧠 System Prompt' + spDisp,
        '',
        '---',
        '## 📝 User Prompt Template' + utDisp,
        '',
        '---',
        '## 💬 Git Commit Prompt' + gpDisp,
        '',
        '---',
        '## 📤 Full Prompt Sent to LLM',
        '',
        '```',
        promptPreview,
        '```',
      ].join('\n');
      const t0 = Date.now();
      const estTokens = (s: string) => Math.round(s.length / 3.5);
      const done = (r: { text?: string; error?: string }) => {
        if (settled) return; settled = true;
        const elapsedMs = Date.now() - t0;
        const promptTokens = estTokens(prompt);
        const completionTokens = estTokens(r.text || '');
        const totalTokens = promptTokens + completionTokens;
        const tokPerSec = elapsedMs > 0 ? Math.round(completionTokens / (elapsedMs / 1000)) : 0;
        this.view?.webview.postMessage({ type: 'genResult', payload: { ...r, provider: prov.name || family, model, trace, tokens: totalTokens, elapsedMs, completionTokens, tokPerSec } });
      };
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
