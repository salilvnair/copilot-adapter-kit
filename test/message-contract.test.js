// Every message the webview can send must have a handler somewhere.
//
// The scan matches ':' in a message name as well as letters. It did not, which
// meant the whole Developer Tools protocol — aiAudit:load, dbExplorer:getRows
// and the rest — was invisible to the one test that exists to catch a control
// that posts into nothing.
//
// This is the test that would have caught the overflow menu doing nothing: the
// UI posted `removeProvider`, and whether anything listened was invisible until
// somebody clicked it. A missing handler is now a failing test, not a silent
// no-op in the product.
//
// It also runs the other way: an action nobody calls is dead weight, and a
// handler nothing posts to is a route that has rotted.

const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];

const WEBVIEW_SRC = path.join(ROOT, 'webview-ui', 'src');
const PANELS = [
  'src/panel/SettingsPanel.ts',
  'src/panel/SpendGuardPanel.ts',
  'src/panel/MiniGitPanel.ts',
];

/** Handlers that exist for the old hand-written panels, kept until those go. */
const LEGACY_HANDLERS = new Set([
  'toggleBuiltin', 'editBuiltin', 'deleteBuiltin', 'updateModelApiPath',
  'execGit', 'execAndGen', 'genCommitMsg',
]);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n          ' + extra : '')); }
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

// ---- what the webview sends ----
const posted = new Map(); // type -> files
for (const file of walk(WEBVIEW_SRC)) {
  const src = fs.readFileSync(file, 'utf-8');
  for (const m of src.matchAll(/\bpost\(\s*'([A-Za-z:]+)'/g)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (!posted.has(m[1])) posted.set(m[1], new Set());
    posted.get(m[1]).add(rel);
  }
}

// ---- what the host handles ----
const handled = new Map(); // type -> panels
for (const rel of PANELS) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  for (const m of src.matchAll(/case\s+'([A-Za-z:]+)'\s*:/g)) {
    if (!handled.has(m[1])) handled.set(m[1], new Set());
    handled.get(m[1]).add(path.basename(rel));
  }
}

console.log('\n=== every posted message has a handler ===');
const orphanPosts = [...posted.keys()].filter(t => !handled.has(t));
check(
  `${posted.size} message types posted, all handled`,
  orphanPosts.length === 0,
  orphanPosts.length
    ? orphanPosts.map(t => `${t}  ← posted from ${[...posted.get(t)].join(', ')}`).join('\n          ')
    : '',
);

console.log('\n=== no handler is dead ===');
const orphanHandlers = [...handled.keys()]
  .filter(t => !posted.has(t) && !LEGACY_HANDLERS.has(t));
check(
  `${handled.size} handlers, none unreachable`,
  orphanHandlers.length === 0,
  orphanHandlers.length
    ? orphanHandlers.map(t => `${t}  ← handled in ${[...handled.get(t)].join(', ')} but never posted`).join('\n          ')
    : '',
);

console.log('\n=== every action helper is used ===');
const stateSrc = fs.readFileSync(path.join(WEBVIEW_SRC, 'app', 'state.ts'), 'utf-8');
const actionsBlock = stateSrc.slice(stateSrc.indexOf('export const actions'));
const actionNames = [...actionsBlock.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map(m => m[1]);
const allSrc = walk(WEBVIEW_SRC).map(f => fs.readFileSync(f, 'utf-8')).join('\n');
const unused = actionNames.filter(n => {
  const uses = [...allSrc.matchAll(new RegExp(`actions\\.${n}\\b`, 'g'))].length;
  return uses === 0;
});
check(
  `${actionNames.length} actions declared, all called`,
  unused.length === 0,
  unused.length ? unused.join(', ') : '',
);

console.log('\n=== each surface answers getState ===');
for (const rel of PANELS) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  check(`${path.basename(rel)} handles getState`, /case\s+'getState'/.test(src));
}

console.log('\n=== destructive actions are confirmed before they fire ===');
const providersSrc = fs.readFileSync(path.join(WEBVIEW_SRC, 'app/screens/Providers.tsx'), 'utf-8');
check(
  'removing a provider opens a confirmation first',
  /setConfirmRemove\(true\)/.test(providersSrc) && /<Confirm/.test(providersSrc),
);
const workspaceSrc = fs.readFileSync(path.join(WEBVIEW_SRC, 'app/screens/Workspace.tsx'), 'utf-8');
check('emptying the bin is confirmed', /<Confirm/.test(workspaceSrc));
check(
  'every danger-zone action is hold-to-confirm',
  (workspaceSrc.match(/<HoldToConfirm/g) || []).length >= 4,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
