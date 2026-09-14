// MiniGitPanel — the Git AI sidebar.
//
// Phase 4: the document is the React bundle built from webview-ui/. The git
// plumbing is unchanged; what changed is that it now sends structured data.
// The old panel computed the branch, the staged counts and the per-file diff
// stats and then formatted them into a string — the counts never reached the
// screen at all. They do now.

import { exec } from 'child_process';
import vscode from 'vscode';
import { resolveCatalog } from '../conduit/model-catalog';
import { fmtTokens, parsePricingUsd } from '../kernel/budget';
import { Context } from '../kernel/context';
import type { Payload, StreamEvents } from '../mesh/contract';
import { estimateTokens } from '../tooling/token-math';
import { WebviewHost } from './webview-host';

interface GitFile {
  path: string;
  dir: string;
  added: number;
  removed: number;
  staged: boolean;
  state: 'new' | 'modified' | 'deleted';
}

export class MiniGitPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private host: WebviewHost;
  /** Model the user picked in the sidebar, remembered for the session. */
  private chosenModel: string | undefined;

  constructor(private ext: vscode.ExtensionContext, private ctx: Context) {
    this.host = new WebviewHost(ext);
  }

  resolveWebviewView(wv: vscode.WebviewView): void {
    this.view = wv;
    wv.webview.options = {
      enableScripts: true,
      localResourceRoots: this.host.localRoots,
    };
    try {
      wv.webview.html = this.host.html(wv.webview, 'sidebar');
    } catch (e) {
      wv.webview.html = `<html><body style="font-family:system-ui;background:#1e1e1e;color:#d4d4d4;padding:20px">
        <p>${(e as Error).message}</p></body></html>`;
      return;
    }

    wv.webview.onDidReceiveMessage(async (m: { type: string; payload?: any }) => {
      try {
        await this._handle(m);
      } catch (e) {
        this._post('genError', { message: (e as Error).message });
      }
    });

    // The working tree changes outside this panel; follow it.
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    const refresh = _debounce(() => void this._send(), 600);
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    watcher.onDidDelete(refresh);
    wv.onDidDispose(() => watcher.dispose());

    void this._send();
  }

  private async _handle(m: { type: string; payload?: any }): Promise<void> {
    switch (m.type) {
      case 'getState':
      case 'refreshGit':
        await this._send();
        break;
      case 'generate':
        await this._generate(m.payload?.message, m.payload?.scope);
        break;
      case 'pickModel':
        await this._pickModel();
        break;
      case 'commit':
        await this._commit(m.payload?.message, Boolean(m.payload?.push));
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(String(m.payload?.text ?? ''));
        void vscode.window.showInformationMessage('Commit message copied.');
        break;
      case 'openFile': {
        const root = _root();
        if (root && m.payload?.path) {
          const uri = vscode.Uri.joinPath(vscode.Uri.file(root), m.payload.path);
          await vscode.commands.executeCommand('vscode.open', uri);
        }
        break;
      }
      case 'openFolder':
        await vscode.commands.executeCommand('vscode.openFolder');
        break;
      case 'initRepo':
        await this._runGit('init');
        await this._send();
        break;
      case 'openGitSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-adapter-kit.gitPrompt');
        break;
      case 'openPanel':
        await vscode.commands.executeCommand('copilot-adapter-kit.openPanel');
        break;
    }
  }

  // ---- State ----

  private async _send(): Promise<void> {
    if (!this.view) return;
    const root = _root();
    const hasRepo = Boolean(root) && (await this._runGit('rev-parse --is-inside-work-tree')).trim() === 'true';

    if (!hasRepo) {
      this._post('gitState', {
        hasRepo: false, ahead: 0, behind: 0, files: [], staged: 0, changed: 0,
        providers: [], models: [], guard: this._guard(),
      });
      return;
    }

    const branch = (await this._runGit('rev-parse --abbrev-ref HEAD')).trim();
    const repo = (await this._runGit('rev-parse --show-toplevel')).trim().split(/[/\\]/).pop() ?? '';
    const files = await this._files();
    const { ahead, behind } = await this._tracking();
    const models = resolveCatalog().map(m => ({ id: m.id, name: m.name, family: m.family }));

    const providers = Object.entries(
      vscode.workspace.getConfiguration('copilot-adapter-kit').get<Record<string, any>>('providers') || {},
    )
      .filter(([, p]) => p && !p._deleted)
      .map(([uuid, p]) => ({ uuid, name: p.name || p.family || uuid, family: p.family || '', hasKey: false }));

    this._post('gitState', {
      hasRepo: true,
      repo, branch, ahead, behind, files,
      staged: files.filter(f => f.staged).length,
      changed: files.length,
      providers, models,
      chosenModel: this.chosenModel ?? models[0]?.id,
      estimate: await this._estimate(files),
      guard: this._guard(),
    });
  }

  private _guard() {
    const s = this.ctx.budget.status();
    const used = s.day.inputTokens + s.day.outputTokens;
    return {
      pct: s.tokenPct >= 0 ? Math.max(s.tokenPct, s.costPct) : 0,
      used,
      limit: s.caps.dailyTokenLimit,
      costUsd: s.day.costUsd,
      enforce: s.caps.enforce,
    };
  }

  /** What the prompt would cost as things stand, so it is known before sending. */
  private async _estimate(files: GitFile[]): Promise<{ tokens: number; costUsd: number }> {
    const diff = await this._diff(files.some(f => f.staged) ? 'staged' : 'all');
    const tokens = estimateTokens(diff) + 400; // the instructions around it
    const meta = resolveCatalog().find(m => m.id === (this.chosenModel ?? ''));
    const price = parsePricingUsd(meta?.pricing);
    return { tokens, costUsd: price ? (tokens / 1e6) * price.input : 0 };
  }

  /** Per-file adds and removes — computed before and thrown away before. */
  private async _files(): Promise<GitFile[]> {
    const status = (await this._runGit('status --porcelain')).trim();
    if (!status) return [];

    const numstat = async (args: string) => {
      const out = await this._runGit(`diff ${args} --numstat`);
      const map = new Map<string, { added: number; removed: number }>();
      for (const line of out.split('\n')) {
        const [a, r, ...rest] = line.trim().split(/\t/);
        if (!rest.length) continue;
        map.set(rest.join('\t'), { added: Number(a) || 0, removed: Number(r) || 0 });
      }
      return map;
    };
    const stagedStats = await numstat('--cached');
    const unstagedStats = await numstat('');

    const out: GitFile[] = [];
    for (const line of status.split('\n')) {
      if (!line.trim()) continue;
      const x = line[0], y = line[1];
      const full = line.slice(3).trim().replace(/^"|"$/g, '');
      const parts = full.split('/');
      const path = parts.pop() ?? full;
      const dir = parts.join('/');
      const staged = x !== ' ' && x !== '?';
      const stats = (staged ? stagedStats.get(full) : unstagedStats.get(full))
        ?? unstagedStats.get(full) ?? stagedStats.get(full) ?? { added: 0, removed: 0 };
      const state: GitFile['state'] =
        x === 'D' || y === 'D' ? 'deleted' : x === '?' || x === 'A' ? 'new' : 'modified';
      out.push({ path, dir, staged, added: stats.added, removed: stats.removed, state });
    }
    return out;
  }

  private async _tracking(): Promise<{ ahead: number; behind: number }> {
    const out = (await this._runGit('rev-list --left-right --count HEAD...@{upstream}')).trim();
    const [a, b] = out.split(/\s+/).map(Number);
    return { ahead: Number.isFinite(a) ? a : 0, behind: Number.isFinite(b) ? b : 0 };
  }

  // ---- Actions ----

  private async _pickModel(): Promise<void> {
    const models = resolveCatalog();
    if (!models.length) {
      void vscode.window.showWarningMessage('No models configured. Add one in Copilot Adapter Kit.');
      return;
    }
    const pick = await vscode.window.showQuickPick(
      models.map(m => ({ label: m.name, description: m.id, detail: m.detail, id: m.id })),
      { placeHolder: 'Model for commit messages', ignoreFocusOut: true },
    );
    if (!pick) return;
    this.chosenModel = pick.id;
    await this._send();
  }

  private async _commit(message: string, push: boolean): Promise<void> {
    if (!message?.trim()) return;
    const staged = (await this._runGit('diff --cached --name-only')).trim();
    if (!staged) {
      const go = await vscode.window.showWarningMessage(
        'Nothing is staged. Stage every change and commit?', 'Stage all and commit', 'Cancel');
      if (go !== 'Stage all and commit') return;
      await this._runGit('add -A');
    }
    const file = vscode.Uri.joinPath(this.ext.globalStorageUri, 'commit-msg.txt');
    await vscode.workspace.fs.createDirectory(this.ext.globalStorageUri);
    await vscode.workspace.fs.writeFile(file, Buffer.from(message, 'utf-8'));
    const res = await this._runGit(`commit -F "${file.fsPath}"`);
    if (push) await this._runGit('push');
    void vscode.window.showInformationMessage(
      push ? 'Committed and pushed.' : `Committed. ${res.split('\n')[0] ?? ''}`.trim());
    await this._send();
  }

  private async _generate(userMessage: string | undefined, scope: 'staged' | 'all'): Promise<void> {
    const files = await this._files();
    const diff = await this._diff(scope === 'staged' && files.some(f => f.staged) ? 'staged' : 'all');
    if (!diff.trim()) {
      this._post('genError', { message: 'Nothing to describe — no changes in scope.' });
      return;
    }

    const cfg = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = cfg.get<Record<string, any>>('providers') || {};
    const modelId = this.chosenModel ?? resolveCatalog()[0]?.id;
    const meta = resolveCatalog().find(m => m.id === modelId);
    const family = meta?.family ?? '';
    const entry = Object.entries(providers).find(([, p]) => p && !p._deleted && p.family === family);
    if (!entry || !meta) {
      this._post('genError', { message: 'No provider configured for this model.' });
      return;
    }
    const [uuid, prov] = entry;
    const key = await this.ctx.vault.fetch(uuid);
    if (!key) {
      this._post('genError', { message: `No API key for ${prov.name || family}.` });
      return;
    }

    const branch = (await this._runGit('rev-parse --abbrev-ref HEAD')).trim();
    const repo = (await this._runGit('rev-parse --show-toplevel')).trim().split(/[/\\]/).pop() ?? '';
    const template = cfg.get<string>('gitPrompt', '') || DEFAULT_GIT_PROMPT;
    const prompt = template
      .replace(/\{branch\}/g, branch)
      .replace(/\{repo\}/g, repo)
      .replace(/\{diff\}/g, diff)
      .replace(/\{guidance\}/g, userMessage?.trim() ? `User guidance: ${userMessage}\n\n` : '');

    const engine = this.ctx.discovery.lookup(prov.family || family);
    engine.configure?.(prov.baseUrl, key);

    const payload: Payload = {
      model: this.ctx.tuning.resolveModelId(meta.id, family),
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 2048,
      apiPath: meta.apiPath || this.ctx.tuning.resolveApiPath(meta.id, family),
      _budget: { pickerId: meta.id, maxIn: meta.maxIn, maxOut: meta.maxOut, pricing: meta.pricing },
    };

    this._post('genStart');
    const started = Date.now();
    let text = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const ms = Date.now() - started;
      this._post('genDone', {
        text: text.trim(),
        ms,
        tokPerSec: ms > 0 ? Math.round(estimateTokens(text) / (ms / 1000)) : 0,
      });
    };

    const sink: StreamEvents = {
      onToken: t => { text += t; this._post('genToken', t); },
      onThinking: () => {},
      onToolSignal: () => {},
      onFault: e => {
        if (text.trim()) { finish(); return; }
        settled = true;
        this._post('genError', { message: e.message || String(e) });
      },
      onComplete: finish,
    };

    // Through the pipeline, so the spend guard sees it like any other request.
    await this.ctx.pipeline.wrap(engine).stream(payload, sink);
    finish();
    await this._send();
  }

  /** Full diff, or a --stat summary once it is too large for a context window. */
  private async _diff(scope: 'staged' | 'all'): Promise<string> {
    const threshold = vscode.workspace.getConfiguration('copilot-adapter-kit')
      .get<number>('maxDiffFiles', 500);
    const count = (await this._runGit('status --porcelain')).trim().split('\n').filter(Boolean).length;
    const args = scope === 'staged' ? '--cached' : '';

    if (count > threshold) {
      const stat = (await this._runGit(`diff ${args} --stat`)).trim();
      const numstat = (await this._runGit(`diff ${args} --numstat`)).trim();
      return `## Compressed diff (${count} files, threshold ${threshold})\n\n`
        + '```\n' + stat + '\n```\n\n### Numstat\n```\n' + numstat + '\n```';
    }
    if (scope === 'staged') return (await this._runGit('diff --cached')).trim();
    return [
      (await this._runGit('diff --cached')).trim(),
      (await this._runGit('diff')).trim(),
    ].filter(Boolean).join('\n\n');
  }

  // ---- Plumbing ----

  private _post(type: string, payload?: unknown): void {
    void this.view?.webview.postMessage({ type, payload });
  }

  private _runGit(args: string): Promise<string> {
    return new Promise(resolve =>
      exec(`git ${args}`, { cwd: _root(), maxBuffer: 10 * 1024 * 1024 }, (err, out) =>
        resolve(err ? '' : out)));
  }
}

const DEFAULT_GIT_PROMPT = `You are an expert Git commit message writer. Generate a **comprehensive conventional commit message** using Markdown.

**Requirements:**
1. First line: type(scope): short summary (max 72 chars)
2. Blank line
3. **## Summary** section
4. **## Changes** bullet points
5. **## Impact** section
6. Use **bold** for file names and inline code for symbols

Branch: {branch}
Repo: {repo}
{guidance}
--- DIFF ---
{diff}

Generate only the commit message.`;

function _root(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function _debounce(fn: () => void, ms: number): () => void {
  let t: NodeJS.Timeout | undefined;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
    t.unref?.();
  };
}

export { fmtTokens };
