// MiniGitPanel — sidebar webview view with git diff + AI commit message gen
import { exec } from 'child_process';
import vscode from 'vscode';
import { resolveCatalog } from '../conduit/model-catalog';
import { Context } from '../kernel/context';
import type { Payload, StreamEvents } from '../mesh/contract';

export class MiniGitPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(private ext: vscode.ExtensionContext, private ctx: Context) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = MiniGitPanel._html();

    webviewView.webview.onDidReceiveMessage(async (msg: { type: string; payload?: any }) => {
      switch (msg.type) {
        case 'getData':
          this._sendProvidersAndModels();
          await this._refreshGit();
          break;
        case 'generate':
          await this._generate(msg.payload?.family, msg.payload?.modelId, msg.payload?.userMsg);
          break;
      }
    });

    setTimeout(() => { this._refreshGit(); this._sendProvidersAndModels(); }, 300);
  }

  private _runGit(args: string): Promise<string> {
    return new Promise((resolve) => {
      const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      exec(`git ${args}`, { cwd: wsFolder, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        resolve(err ? '' : stdout);
      });
    });
  }

  private _sendProvidersAndModels(): void {
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = config.get<Record<string, any>>('providers') || {};
    const families = Object.keys(providers).map(f => ({
      family: f, name: providers[f].name || f,
    }));
    this.view?.webview.postMessage({ type: 'providers', payload: { families } });

    const catalog = resolveCatalog();
    const mb: Record<string, { id: string; name: string }[]> = {};
    for (const fam of families) {
      mb[fam.family] = catalog.filter(m => m.family === fam.family).map(m => ({ id: m.id, name: m.name }));
    }
    this.view?.webview.postMessage({ type: 'models', payload: { modelsByFamily: mb } });
  }

  private async _refreshGit(): Promise<void> {
    if (!this.view) return;
    try {
      const branch = (await this._runGit('rev-parse --abbrev-ref HEAD')).trim();
      const repo = (await this._runGit('rev-parse --show-toplevel')).trim().split('/').pop() || '';
      const statusShort = (await this._runGit('status --short')).trim();
      const stagedCount = (await this._runGit('diff --cached --name-only')).trim().split('\n').filter(Boolean).length;
      const unstagedCount = (await this._runGit('diff --name-only')).trim().split('\n').filter(Boolean).length;
      this.view.webview.postMessage({
        type: 'gitData',
        payload: { branch, repo, statusShort, stagedCount, unstagedCount },
      });
    } catch {
      this.view.webview.postMessage({ type: 'gitData', payload: {} });
    }
  }

  private async _generate(chosenFamily?: string, chosenModel?: string, userMsg?: string): Promise<void> {
    if (!this.view || !this.ctx) return;
    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const providers = config.get<Record<string, any>>('providers') || {};
    const families = Object.keys(providers);
    if (!families.length) {
      this.view.webview.postMessage({ type: 'genResult', payload: { error: 'No providers configured.' } });
      return;
    }
    const family = (chosenFamily && providers[chosenFamily]) ? chosenFamily : families[0];
    const provider = providers[family];
    const key = await this.ext.secrets.get(`copilot-adapter-kit.apiKey.${family}`);
    if (!key) {
      this.view.webview.postMessage({ type: 'genResult', payload: { error: `No API key for "${provider.name || family}".` } });
      return;
    }

    try {
      const staged = (await this._runGit('diff --cached')).trim();
      const unstaged = (await this._runGit('diff')).trim();
      const diff = [staged, unstaged].filter(Boolean).join('\n\n');
      if (!diff) {
        this.view.webview.postMessage({ type: 'genResult', payload: { error: 'No changes found.' } });
        return;
      }

      const engine = this.ctx.discovery.lookup(family);
      engine.configure?.(provider.baseUrl, key);

      const branch = (await this._runGit('rev-parse --abbrev-ref HEAD')).trim();
      const repo = (await this._runGit('rev-parse --show-toplevel')).trim().split('/').pop() || '';

      const gitPromptConfig = config.get<string>('gitPrompt', '');
      const defaultPrompt = `You are an expert Git commit message writer. Analyze the following git diff and generate a **comprehensive, well-structured conventional commit message** using Markdown.

**Requirements:**
1. First line: conventional commit type (feat/fix/chore/docs/refactor/test/style/perf/ci) + optional scope in parentheses + colon + short summary (max 72 chars)
2. Blank line
3. A **## Summary** section (2-3 sentences explaining WHAT changed and WHY)
4. A **## Changes** section with bullet points describing each key change
5. A **## Impact** section with bullet points about affected areas, breaking changes, or testing notes
6. Use **bold** for file names, function names, or important terms
7. Use inline code for code symbols, CLI commands, or technical identifiers

Be thorough and professional. Think step by step about the actual purpose of each change.

Branch: {branch}
Repo: {repo}
{guidance}
--- DIFF ---
{diff}

Generate only the commit message, nothing else.`;
      const guidance = userMsg?.trim() ? `User guidance: ${userMsg.trim()}\n\n` : '';
      const resolvedPrompt = (gitPromptConfig || defaultPrompt)
        .replace(/\{branch\}/g, branch)
        .replace(/\{repo\}/g, repo)
        .replace(/\{diff\}/g, diff)
        .replace(/\{guidance\}/g, guidance);

      const catalog = resolveCatalog();
      const familyModels = catalog.filter(m => m.family === family);
      const actualModel = (chosenModel && chosenModel !== 'auto')
        ? chosenModel
        : (familyModels.length > 0 ? familyModels[0].id : 'gpt-4o');
      const apiPath = provider.defaultApiPath || '/chat/completions';

      const payload: Payload = {
        model: actualModel,
        messages: [{ role: 'user', content: resolvedPrompt }],
        stream: true,
        max_tokens: 2048,
        apiPath,
      };

      const wrapped = this.ctx.pipeline.wrap(engine);
      let text = '';
      let settled = false;
      const done = (result: { text?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        this.view?.webview.postMessage({
          type: 'genResult',
          payload: { ...result, provider: provider.name || family, model: actualModel },
        });
      };
      const sink: StreamEvents = {
        onToken: (t: string) => { text += t; this.view?.webview.postMessage({ type: 'genToken', payload: t }); },
        onThinking: () => {},
        onToolSignal: () => {},
        onFault: async (e: Error) => {
          if (!text.trim()) done({ error: e.message || String(e) });
          else done({ text: text.trim() });
        },
        onComplete: () => {
          if (!text.trim()) done({ error: 'LLM returned empty response.' });
          else done({ text: text.trim() });
        },
      };
      await wrapped.stream(payload, sink);
      if (!settled) done({ error: 'No response from LLM.' });
    } catch (e: any) {
      this.view.webview.postMessage({ type: 'genResult', payload: { error: e.message || String(e) } });
    }
  }

  private static _html(): string {
    // Using string concatenation instead of template literal to avoid escaping hell
    return '<!DOCTYPE html>\n' +
    '<html lang="en" data-theme="dark"><head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1.0">\n' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\';">\n' +
    '<title>CAK Git</title>\n' +
    '<style>\n' +
    ':root{--bg:#1e1e1e;--surface:#252526;--input:#2d2d2d;--border:#3c3c3c;--text:#d4d4d4;--muted:#888;--primary:#6366f1;--primary-hover:#818cf8;--success:#22c55e;--error:#ef4444;--warning:#f59e0b;--info:#3b82f6}\n' +
    '*{margin:0;padding:0;box-sizing:border-box}\n' +
    'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);display:flex;flex-direction:column;height:100vh;overflow:hidden;font-size:12px}\n' +
    '.input-area{padding:8px 8px 4px;flex-shrink:0}\n' +
    '.input-wrap{position:relative;display:flex}\n' +
    '.input-area textarea{flex:1;background:var(--input);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 34px 7px 8px;font-size:11px;font-family:inherit;resize:none;height:38px;outline:none;line-height:1.4}\n' +
    '.input-area textarea:focus{border-color:var(--primary);box-shadow:0 0 0 2px rgba(99,102,241,.15)}\n' +
    '.input-area textarea::placeholder{color:var(--muted)}\n' +
    '.sparkle-btn{position:absolute;right:3px;top:50%;transform:translateY(-50%);background:var(--primary);color:#fff;border:none;border-radius:5px;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;transition:all 120ms;z-index:2}\n' +
    '.sparkle-btn:hover{background:var(--primary-hover)}\n' +
    '.sparkle-btn:disabled{opacity:.4;cursor:not-allowed}\n' +
    '.spinner{animation:spin .8s linear infinite}\n' +
    '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}\n' +
    '.dd-row{padding:8px 8px 4px;display:flex;align-items:center;gap:8px;font-size:10px;color:var(--muted);flex-shrink:0}\n' +
    'select.native-dd{background:var(--input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:10px;padding:4px 8px;outline:none;min-width:110px;cursor:pointer}\n' +
    'select.native-dd:focus{border-color:var(--primary);box-shadow:0 0 0 2px rgba(99,102,241,.15)}\n' +
    '.result-area{padding:8px;flex-shrink:0;min-height:36px;max-height:45%;overflow-y:auto}\n' +
    '.result-area .loading{color:var(--muted);font-size:11px;padding:0 4px}\n' +
    '.result-area .error{color:var(--error);font-size:11px;padding:0 4px}\n' +
    '.msg-card{background:#2a2d2e;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 16px;position:relative;animation:card-in 180ms ease-out;box-shadow:0 4px 16px rgba(0,0,0,.25)}\n' +
    '@keyframes card-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}\n' +
    '.msg-card .card-actions{position:absolute;top:10px;right:10px;display:flex;gap:4px}\n' +
    '.msg-card .card-actions button{width:22px;height:22px;border:none;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all 120ms;background:transparent}\n' +
    '.msg-card .card-actions .copy-btn{color:rgba(255,255,255,.35)}\n' +
    '.msg-card .card-actions .copy-btn:hover{color:var(--primary);background:rgba(99,102,241,.1)}\n' +
    '.msg-card .card-actions .copy-btn.copied{color:var(--success)!important}\n' +
    '.msg-card .card-actions .clear-btn{color:rgba(255,255,255,.2)}\n' +
    '.msg-card .card-actions .clear-btn:hover{color:var(--error);background:rgba(239,68,68,.1)}\n' +
    '.msg-card .msg-subject{font-size:13px;font-weight:700;color:#f4f4f5;margin-bottom:8px;padding-right:44px;line-height:1.3}\n' +
    '.msg-card .msg-body{font-size:11px;color:var(--muted);white-space:pre-wrap;line-height:1.6}\n' +
    '.msg-card .msg-body ul,.msg-card .msg-body ol{padding-left:16px;margin:4px 0}\n' +
    '.msg-card .msg-body li{margin:2px 0}\n' +
    '.msg-card .msg-body li::marker{color:rgba(99,102,241,.5)}\n' +
    '.msg-card .card-badge{display:inline-flex;align-items:center;gap:4px;font-size:9px;padding:2px 8px;border-radius:999px;font-weight:600;margin-top:10px}\n' +
    '.splitter-wrap{position:relative;flex-shrink:0;z-index:10}\n' +
    '.splitter-bar{height:6px;cursor:row-resize;display:flex;align-items:center;justify-content:center;user-select:none}\n' +
    '.splitter-bar .splitter-line{height:3px;border-radius:3px;width:44px;background:rgba(255,255,255,.08);transition:all 150ms}\n' +
    '.splitter-bar:hover .splitter-line,.splitter-bar.dragging .splitter-line{width:80px;background:var(--primary)}\n' +
    '.splitter-tip{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:var(--surface);color:var(--text);font-size:10px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);white-space:nowrap;pointer-events:none;z-index:50;display:none}\n' +
    '.splitter-wrap:hover .splitter-tip{display:block}\n' +
    '.diff-area{overflow-y:auto;padding:4px 8px;flex:1 1 0%}\n' +
    '.badge-row{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}\n' +
    '.badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 7px;border-radius:999px;font-weight:600}\n' +
    '.badge-info{background:rgba(59,130,246,.12);color:var(--info)}\n' +
    '.badge-primary{background:rgba(99,102,241,.12);color:var(--primary)}\n' +
    '.badge-success{background:rgba(34,197,94,.12);color:var(--success)}\n' +
    '.badge-warning{background:rgba(245,158,11,.12);color:var(--warning)}\n' +
    '.file-list{font-size:11px;font-family:monospace;line-height:1.6}\n' +
    '.file-row{display:flex;gap:6px;padding:1px 0}\n' +
    '.file-mark{width:18px;text-align:center;flex-shrink:0;font-weight:700}\n' +
    '.file-mark.M{color:var(--warning)}.file-mark.A{color:var(--success)}.file-mark.D{color:var(--error)}\n' +
    '.file-mark.u{color:var(--muted)}\n' +
    '.file-path{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n' +
    '.empty-state{color:var(--muted);padding:16px;text-align:center;font-size:11px}\n' +
    '::-webkit-scrollbar{width:4px}\n' +
    '::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px}\n' +
    '</style></head>\n' +
    '<body>\n' +
    '<div class="input-area">\n' +
    '  <div class="input-wrap">\n' +
    '    <textarea id="msgInput" placeholder="Describe your changes (optional)..."></textarea>\n' +
    '    <button class="sparkle-btn" id="genBtn" onclick="doGenerate()">&#10024;</button>\n' +
    '  </div>\n' +
    '</div>\n' +
    '<div class="dd-row">\n' +
    '  <span>Provider:</span><select id="provSelect" class="native-dd" onchange="onProvChange()"></select>\n' +
    '  <span style="margin-left:4px">Model:</span><select id="modelSelect" class="native-dd" onchange="onModelChange()"></select>\n' +
    '</div>\n' +
    '<div class="result-area" id="resultArea"></div>\n' +
    '<div class="splitter-wrap" id="splitterWrap">\n' +
    '  <div class="splitter-bar" id="splitterBar"><div class="splitter-line"></div></div>\n' +
    '  <div class="splitter-tip">Drag to resize &bull; Double-click to reset</div>\n' +
    '</div>\n' +
    '<div class="diff-area" id="diffArea">\n' +
    '<div class="empty-state">Loading git status...</div>\n' +
    '</div>\n' +
    '<script>\n' +
    'var vsc=acquireVsCodeApi();\n' +
    'var gitBranch="",gitRepo="",gitStatus="",stagedCount=0,unstagedCount=0;\n' +
    'var genFamily="",genModel="";\n' +
    'var generating=false,genText="",modelsByFamily={};\n' +
    'var genProvName="",genModelName="";\n' +
    'function $(id){return document.getElementById(id)}\n' +
    'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;")}\n' +
    'function onProvChange(){genFamily=$("provSelect").value;populateModels()}\n' +
    'function onModelChange(){genModel=$("modelSelect").value}\n' +
    'function populateModels(){\n' +
    '  var list=modelsByFamily[genFamily]||[];\n' +
    '  var sel=$("modelSelect");if(!sel)return;\n' +
    '  sel.innerHTML=""\n' +
    '  for(var i=0;i<list.length;i++){\n' +
    '    sel.innerHTML+="<option value=\\""+esc(list[i].id)+"\\">"+esc(list[i].name)+"</option>";\n' +
    '  }\n' +
    '  if(!list.length){sel.innerHTML="<option value=\\"\\">(no models)</option>";genModel=""}\n' +
    '  else genModel=list[0].id;\n' +
    '}\n' +
    'function doGenerate(){\n' +
    '  if(generating)return;\n' +
    '  genFamily=$("provSelect")?$("provSelect").value:"";\n' +
    '  genModel=$("modelSelect")?$("modelSelect").value:"";\n' +
    '  var msg=$("msgInput").value.trim();\n' +
    '  generating=true;genText="";\n' +
    '  renderResult("loading");\n' +
    '  vsc.postMessage({type:"generate",payload:{family:genFamily,modelId:genModel,userMsg:msg}});\n' +
    '}\n' +
    'function renderDiff(){\n' +
    '  var d=$("diffArea");if(!d)return;\n' +
    '  if(!gitBranch&&!gitStatus){d.innerHTML="<div class=\\"empty-state\\">No git repository detected.</div>";return}\n' +
    '  var h="";\n' +
    '  if(gitBranch||gitRepo){\n' +
    '    h+="<div class=\\"badge-row\\">";\n' +
    '    if(gitBranch)h+="<span class=\\"badge badge-info\\">&#127793; "+esc(gitBranch)+"</span>";\n' +
    '    if(gitRepo)h+="<span class=\\"badge badge-primary\\">&#128193; "+esc(gitRepo)+"</span>";\n' +
    '    if(stagedCount)h+="<span class=\\"badge badge-success\\">"+stagedCount+" staged</span>";\n' +
    '    if(unstagedCount)h+="<span class=\\"badge badge-warning\\">"+unstagedCount+" unstaged</span>";\n' +
    '    if(!stagedCount&&!unstagedCount)h+="<span class=\\"badge\\" style=\\"background:rgba(255,255,255,.05)\\">no changes</span>";\n' +
    '    h+="</div>";\n' +
    '  }\n' +
    '  if(gitStatus){\n' +
    '    h+="<div class=\\"file-list\\">";\n' +
    '    gitStatus.split("\\n").forEach(function(line){\n' +
    '      if(!line.trim())return;\n' +
    '      var mark=line.slice(0,2).trim(),path=line.slice(3);\n' +
    '      var cls="u";\n' +
    '      if(mark.indexOf("M")>=0)cls="M";else if(mark.indexOf("A")>=0)cls="A";else if(mark.indexOf("D")>=0)cls="D";\n' +
    '      h+="<div class=\\"file-row\\"><span class=\\"file-mark "+cls+"\\">"+esc(mark)+"</span><span class=\\"file-path\\" title=\\""+esc(path)+"\\">"+esc(path)+"</span></div>";\n' +
    '    });h+="</div>";\n' +
    '  }\n' +
    '  d.innerHTML=h;\n' +
    '}\n' +
    'function renderResult(mode,errMsg){\n' +
    '  var d=$("resultArea"),btn=$("genBtn");if(!d)return;\n' +
    '  if(btn){btn.disabled=false;btn.innerHTML="&#10024;"}\n' +
    '  generating=false;\n' +
    '  if(mode==="loading"){\n' +
    '    d.innerHTML="<div class=\\"loading\\"><span class=\\"spinner\\">&#9203;</span> Generating...</div>";\n' +
    '    generating=true;if(btn){btn.disabled=true;btn.innerHTML="<span class=\\"spinner\\">&#9203;</span>"}\n' +
    '  }else if(mode==="error"){\n' +
    '    d.innerHTML="<div class=\\"error\\">&#10060; "+esc(errMsg||"")+"</div>";\n' +
    '  }else{\n' +
    '    if(genText){\n' +
    '      var lines=genText.split("\\n"),subject=lines[0]||"",body=lines.slice(1).join("\\n").trim();\n' +
    '      var bodyHtml="";\n' +
    '      if(body){\n' +
    '        bodyHtml=body.replace(/^- (.+)$/gm,"<li>$1</li>");\n' +
    '        var hasLi=bodyHtml.indexOf("<li>")>=0;\n' +
    '        if(hasLi)bodyHtml="<ul>"+bodyHtml+"</ul>";\n' +
    '        else bodyHtml="<div class=\\"msg-body\\">"+esc(body)+"</div>";\n' +
    '      }\n' +
    '      var badgeHtml="";\n' +
    '      if(genProvName){\n' +
    '        var ph=0;for(var pi=0;pi<genProvName.length;pi++)ph=((ph<<5)-ph)+genProvName.charCodeAt(pi);\n' +
    '        badgeHtml+="<span class=\\"card-badge\\" style=\\"background:hsla("+(Math.abs(ph)%360)+",70%,55%,.15);color:hsl("+(Math.abs(ph)%360)+",70%,60%)\\">&#9881; "+esc(genProvName)+"</span>";\n' +
    '      }\n' +
    '      if(genModelName){\n' +
    '        var mh=0;for(var mi=0;mi<genModelName.length;mi++)mh=((mh<<5)-mh)+genModelName.charCodeAt(mi);\n' +
    '        badgeHtml+="<span class=\\"card-badge\\" style=\\"background:hsla("+(Math.abs(mh)%360)+",70%,55%,.15);color:hsl("+(Math.abs(mh)%360)+",70%,60%)\\">&#9881; "+esc(genModelName)+"</span>";\n' +
    '      }\n' +
    '      var svgCopy="<svg width=\\"12\\" height=\\"12\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2.5\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><rect x=\\"9\\" y=\\"9\\" width=\\"13\\" height=\\"13\\" rx=\\"2\\" ry=\\"2\\"/><path d=\\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\\"/></svg>";\n' +
    '      var svgX="<svg width=\\"12\\" height=\\"12\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2.5\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><line x1=\\"18\\" y1=\\"6\\" x2=\\"6\\" y2=\\"18\\"/><line x1=\\"6\\" y1=\\"6\\" x2=\\"18\\" y2=\\"18\\"/></svg>";\n' +
    '      d.innerHTML="<div class=\\"msg-card\\">"\n' +
    '        +"<div class=\\"card-actions\\"><button class=\\"copy-btn\\" id=\\"copyIcon\\" onclick=\\"copyResult()\\" title=\\"Copy\\">"+svgCopy+"</button>"\n' +
    '        +"<button class=\\"clear-btn\\" onclick=\\"clearResult()\\" title=\\"Clear\\">"+svgX+"</button></div>"\n' +
    '        +"<div class=\\"msg-subject\\">"+esc(subject)+"</div>"\n' +
    '        +bodyHtml\n' +
    '        +(badgeHtml?"<div>"+badgeHtml+"</div>":"")\n' +
    '        +"</div>";\n' +
    '    }else{d.innerHTML=""}\n' +
    '  }\n' +
    '}\n' +
    'function copyResult(){\n' +
    '  navigator.clipboard.writeText(genText).then(function(){\n' +
    '    var btn=$("copyIcon");\n' +
    '    if(btn){\n' +
    '      btn.classList.add("copied");\n' +
    '      btn.innerHTML="<svg width=\\"12\\" height=\\"12\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"3\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><polyline points=\\"20 6 9 17 4 12\\"/></svg>";\n' +
    '      setTimeout(function(){btn.classList.remove("copied");btn.innerHTML="<svg width=\\"12\\" height=\\"12\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2.5\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><rect x=\\"9\\" y=\\"9\\" width=\\"13\\" height=\\"13\\" rx=\\"2\\" ry=\\"2\\"/><path d=\\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\\"/></svg>"},1500);\n' +
    '    }\n' +
    '  }).catch(function(){});\n' +
    '}\n' +
    'function clearResult(){genText="";$("resultArea").innerHTML=""}\n' +
    '\n' +
    '// Splitter — simple mousedown/move/up on document\n' +
    '(function(){\n' +
    '  var bar=$("splitterBar"),ra=$("resultArea"),ta=$("diffArea");\n' +
    '  if(!bar||!ra||!ta)return;\n' +
    '  var drag=false,startY=0,startH=0;\n' +
    '  bar.addEventListener("mousedown",function(e){\n' +
    '    drag=true;startY=e.clientY;startH=ra.offsetHeight||120;\n' +
    '    bar.classList.add("dragging");\n' +
    '    e.preventDefault();\n' +
    '  });\n' +
    '  document.addEventListener("mousemove",function(e){\n' +
    '    if(!drag)return;\n' +
    '    var dy=e.clientY-startY;\n' +
    '    var maxH=ta.parentElement?ta.parentElement.clientHeight*0.8:9999;\n' +
    '    var newH=Math.max(20,Math.min(maxH,startH+dy));\n' +
    '    ra.style.height=newH+"px";\n' +
    '    ra.style.flexShrink="0";\n' +
    '    ta.style.flex="1 1 0%";\n' +
    '  });\n' +
    '  document.addEventListener("mouseup",function(){\n' +
    '    if(drag){drag=false;bar.classList.remove("dragging")}\n' +
    '  });\n' +
    '  bar.addEventListener("dblclick",function(){\n' +
    '    ra.style.height="";ra.style.flexShrink="";ta.style.flex="1 1 0%";\n' +
    '  });\n' +
    '})();\n' +
    '\n' +
    'window.addEventListener("message",function(e){\n' +
    '  var p=e.data.payload||{},t=e.data.type;\n' +
    '  if(t==="gitData"){\n' +
    '    gitBranch=p.branch||"";gitRepo=p.repo||"";gitStatus=p.statusShort||"";\n' +
    '    stagedCount=p.stagedCount||0;unstagedCount=p.unstagedCount||0;\n' +
    '    renderDiff();\n' +
    '  }else if(t==="providers"){\n' +
    '    var fams=p.families||[];\n' +
    '    var sel=$("provSelect");if(!sel)return;\n' +
    '    sel.innerHTML="";\n' +
    '    for(var i=0;i<fams.length;i++){\n' +
    '      sel.innerHTML+="<option value=\\""+esc(fams[i].family)+"\\">"+esc(fams[i].name)+"</option>";\n' +
    '    }\n' +
    '    if(fams.length&&!genFamily){genFamily=fams[0].family;onProvChange()}\n' +
    '  }else if(t==="models"){\n' +
    '    modelsByFamily=p.modelsByFamily||{};\n' +
    '    populateModels();\n' +
    '  }else if(t==="genToken"){\n' +
    '    genText+=e.data.payload;\n' +
    '  }else if(t==="genResult"){\n' +
    '    var b=$("genBtn");if(b){b.disabled=false;b.innerHTML="&#10024;"}\n' +
    '    generating=false;\n' +
    '    genProvName=p.provider||"";genModelName=p.model||"";\n' +
    '    if(p.error){genText="";renderResult("error",p.error)}\n' +
    '    else{genText=p.text||genText;renderResult("")}\n' +
    '  }\n' +
    '});\n' +
    'vsc.postMessage({type:"getData"});\n' +
    '</script>\n' +
    '</body></html>';
  }
}
