// Verifies the document WebviewHost emits against the real Vite manifest.
// This is the check that was missing when the CSP blocked every shared chunk.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const ROOT = process.argv[2];

const CSP_SOURCE = 'https://file+.vscode-resource.vscode-cdn.net';

const vscodeStub = {
  Uri: { file: (p) => ({ fsPath: p, toString: () => 'file://' + p.replace(/\\/g, '/') }) },
  window: {},
  commands: {},
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'vscode') return 'vscode';
  return origResolve.call(this, req, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const { WebviewHost } = require(path.join(ROOT, 'out/panel/webview-host.js'));

const ext = { extensionPath: ROOT };
const webview = {
  cspSource: CSP_SOURCE,
  asWebviewUri: (uri) =>
    CSP_SOURCE + '/' + String(uri.fsPath).replace(/\\/g, '/').replace(/^[A-Za-z]:\//, ''),
};

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'media/dist/.vite/manifest.json'), 'utf-8'),
);

const host = new WebviewHost(ext);

for (const entry of ['settings', 'spendGuard', 'sidebar', 'harness']) {
  console.log(`\n=== ${entry} ===`);
  const html = host.html(webview, entry);

  // --- CSP ---
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src')).trim();
  const nonce = html.match(/nonce-([A-Za-z0-9]+)/)[1];

  check('script-src allows the resource origin', scriptSrc.includes(CSP_SOURCE), scriptSrc);
  check('script-src still carries the nonce', scriptSrc.includes(`'nonce-${nonce}'`), scriptSrc);
  check('default-src is none', csp.includes("default-src 'none'"));
  check('no remote origin is allowed', !/https?:\/\/(?!file\+\.vscode-resource)/.test(csp), csp);
  check('entry script carries the nonce', html.includes(`<script type="module" nonce="${nonce}"`));
  check('preload links carry the nonce', !/<link rel="modulepreload"(?![^>]*nonce=)/.test(html));

  // --- every chunk the entry needs is referenced ---
  const key = { settings: 'settings.html', spendGuard: 'spend-guard.html', sidebar: 'sidebar.html', harness: 'harness.html' }[entry];
  const needed = new Set();
  (function walk(k, seen = new Set()) {
    const c = manifest[k];
    if (!c || seen.has(k)) return;
    seen.add(k);
    needed.add(c.file);
    for (const d of c.imports ?? []) walk(d, seen);
  })(key);

  const referenced = [...html.matchAll(/href="[^"]*\/(assets\/[^"]+)"|src="[^"]*\/(assets\/[^"]+)"/g)]
    .map(m => m[1] || m[2]);
  const missing = [...needed].filter(f => !referenced.includes(f));
  check('every static chunk is referenced', missing.length === 0, missing.join(', '));

  // --- css ---
  const cssNeeded = new Set();
  (function walkCss(k, seen = new Set()) {
    const c = manifest[k];
    if (!c || seen.has(k)) return;
    seen.add(k);
    for (const f of c.css ?? []) cssNeeded.add(f);
    for (const d of c.imports ?? []) walkCss(d, seen);
  })(key);
  const cssMissing = [...cssNeeded].filter(f => !referenced.includes(f));
  check('stylesheet is linked', cssNeeded.size > 0 && cssMissing.length === 0, cssMissing.join(', '));

  // --- files actually exist on disk ---
  const onDisk = referenced.every(f => fs.existsSync(path.join(ROOT, 'media/dist', f)));
  check('every referenced file exists on disk', onDisk);

  // --- the mock's root class is present ---
  check('body carries the dui scope', /<body class="dui">/.test(html));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
