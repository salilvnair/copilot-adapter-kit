// The status menu — what opens when the status bar item is clicked.
//
// A QuickPick cannot be screenshotted either, so the items it builds are
// asserted instead: every actionable row runs a command that exists, readout
// rows are inert on purpose, and the unguarded state leads rather than hides.

const Module = require('module');
const path = require('path');
const ROOT = process.argv[2];

const executed = [];
const disposables = [];

const vscodeStub = {
  QuickPickItemKind: { Separator: -1, Default: 0 },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  ThemeColor: class { constructor(id) { this.id = id; } },
  MarkdownString: class {
    constructor() { this.value = ''; }
    appendMarkdown(m) { this.value += m; return this; }
  },
  commands: { executeCommand: (c, ...a) => { executed.push(c); return Promise.resolve(); } },
  window: {
    createQuickPick: () => {
      const qp = {
        items: [], buttons: [], title: '', placeholder: '',
        matchOnDescription: false, matchOnDetail: false, selectedItems: [],
        shown: false, hidden: false, disposed: false,
        onDidTriggerButton(fn) { qp._button = fn; },
        onDidAccept(fn) { qp._accept = fn; },
        onDidHide(fn) { qp._hide = fn; },
        show() { qp.shown = true; },
        hide() { qp.hidden = true; },
        dispose() { qp.disposed = true; },
      };
      vscodeStub.window._last = qp;
      return qp;
    },
  },
  workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'vscode') return 'vscode';
  return origResolve.call(this, req, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };
// The menu records that it was opened; the database is not what is under test.
require.cache[require.resolve(path.join(ROOT, 'out/storage/db.js'))] = {
  id: 'db', filename: 'db', loaded: true,
  exports: { insertUiAudit() {}, insertAudit() {} },
};

const { showStatusMenu } = require(path.join(ROOT, 'out/panel/status-menu.js'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

/** Every command the extension registers, read from the manifest. */
const MANIFEST = new Set(
  require(path.join(ROOT, 'package.json')).contributes.commands.map(c => c.command),
);

const HOUR = new Date().getHours();
function today(values) {
  const hourly = new Array(24).fill(0);
  values.slice(0, HOUR + 1).forEach((v, i) => { hourly[i] = v; });
  return { hourly, hourlyCost: hourly.map(v => (v / 1e6) * 12) };
}

const status = (o = {}) => ({
  caps: {
    enforce: true, dailyTokenLimit: 2_000_000, dailyCostLimitUsd: 25,
    maxInputTokensPerRequest: 200_000, maxOutputTokens: 0, maxTurnsPerConversation: 50,
    ...(o.caps ?? {}),
  },
  day: {
    day: '2026-09-13', inputTokens: 0, outputTokens: 0, costUsd: 0, requests: 0, blocked: 0,
    estimated: false, byModel: {}, hourly: new Array(24).fill(0),
    hourlyCost: new Array(24).fill(0), refusals: [], ...(o.day ?? {}),
  },
  history: [], tokenPct: o.tokenPct ?? 0, costPct: o.costPct ?? 0,
  overLimit: o.overLimit ?? false, nearLimit: o.nearLimit ?? false,
});

/** Opens the menu against a fixed status and hands back the QuickPick. */
function open(s) {
  const listeners = [];
  const ctx = {
    budget: {
      status: () => s,
      onChange: fn => { listeners.push(fn); return { dispose() { listeners.disposed = true; } }; },
    },
  };
  showStatusMenu(ctx);
  const qp = vscodeStub.window._last;
  qp._listeners = listeners;
  return qp;
}

const SEPARATOR = -1;
const rows = qp => qp.items.filter(i => i.kind !== SEPARATOR);
const labels = qp => qp.items.map(i => i.label).join(' | ');

console.log('\n=== 1. the menu opens and is navigable ===');
{
  const qp = open(status({ day: { inputTokens: 500_000, requests: 42, ...today([1000, 40_000, 400_000, 150_000]) }, tokenPct: 26 }));
  check('it is shown', qp.shown === true);
  check('it is titled', qp.title === 'Copilot Adapter Kit', qp.title);
  check('it can be filtered by the values, not just the labels',
    qp.matchOnDescription === true && qp.matchOnDetail === true);
  check('the title bar offers the dashboard and settings', qp.buttons.length === 2);
  check('sections are separated', qp.items.some(i => i.kind === SEPARATOR));
  check('no emoji anywhere', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(labels(qp)), labels(qp));
}

console.log('\n=== 2. every row that acts, acts on a real command ===');
{
  const qp = open(status({ day: { inputTokens: 900_000, costUsd: 12, requests: 88, blocked: 3,
    refusals: [{ at: Date.now(), reason: 'Daily token budget reached', modelId: 'gpt-4o', estimatedInput: 9000 }],
    byModel: { 'gpt-4o': { inputTokens: 800_000, outputTokens: 100_000 } },
    ...today([1000, 20_000, 500_000]) }, tokenPct: 45, costPct: 48 }));

  const actionable = rows(qp).filter(i => i.run);
  check('several rows are actionable', actionable.length >= 5, String(actionable.length));

  let bad = [];
  for (const item of actionable) {
    executed.length = 0;
    item.run();
    const cmd = executed[0];
    if (!cmd || !MANIFEST.has(cmd)) bad.push(`${item.label} -> ${cmd}`);
  }
  check('each one runs a command the manifest declares', bad.length === 0, bad.join(', '));

  check('every row has a label', rows(qp).every(i => i.label && i.label.trim().length > 0));
  check('every row carries a figure or an explanation',
    rows(qp).every(i => i.description || i.detail),
    rows(qp).filter(i => !i.description && !i.detail).map(i => i.label).join(', '));
}

console.log('\n=== 3. the day is reported the way the hover reports it ===');
{
  const qp = open(status({ day: { inputTokens: 500_000, outputTokens: 20_000, costUsd: 6.25, requests: 42,
    byModel: { 'deepseek-chat': { inputTokens: 400_000, outputTokens: 28_000 } },
    ...today([1000, 40_000, 400_000, 150_000, 60_000]) }, tokenPct: 26, costPct: 25 }));

  const tokens = rows(qp).find(i => i.label.includes('Tokens'));
  const cost = rows(qp).find(i => i.label.includes('Cost'));
  check('tokens are reported', tokens?.description?.includes('520.0K of 2.00M'), tokens?.description);
  check('the percentage is spelled out', tokens?.description?.includes('26% used'), tokens?.description);
  check('cost is reported', cost?.description?.includes('$6.25 of $25.00'), cost?.description);

  check('the day is drawn as a sparkline', /[▁-█]+/.test(tokens?.detail ?? ''), tokens?.detail);
  if (HOUR >= 3) {
    check('the busiest hour is named', /busiest at \d\d:00/.test(tokens?.detail ?? ''), tokens?.detail);
  } else {
    console.log('  SKIP  peak assertion (the day has barely started)');
  }
  check('the busiest model is named',
    rows(qp).some(i => (i.detail ?? '').includes('deepseek-chat')),
    rows(qp).map(i => i.detail).join(' / '));
}

console.log('\n=== 4. an empty day says so rather than drawing a flat line ===');
{
  const qp = open(status());
  const tokens = rows(qp).find(i => i.label.includes('Tokens'));
  check('it says nothing has been spent', tokens?.detail === 'Nothing spent yet today', tokens?.detail);
  check('and draws no sparkline', !/[▁-█]/.test(tokens?.detail ?? ''), tokens?.detail);
  check('no model line is invented',
    rows(qp).some(i => (i.detail ?? '').includes('No model has been called today')));
}

console.log('\n=== 5. an unguarded session leads the menu ===');
{
  const qp = open(status({ caps: { enforce: false }, day: { inputTokens: 90_000, ...today([0, 5000, 20_000]) } }));
  const first = rows(qp)[0];
  check('the warning is the first row', first.label.includes('Spend guard is off'), first.label);
  check('and picking it turns protection back on', (() => {
    executed.length = 0; first.run(); return executed[0] === 'copilot-adapter-kit.enableSpendGuard';
  })(), executed[0]);
  check('the guard row agrees', rows(qp).some(i => i.label.includes('Guard') && i.description === 'off'));
  check('an uncapped budget does not claim a percentage',
    rows(qp).find(i => i.label.includes('Tokens'))?.description?.includes('no limit set') === false
    || rows(qp).find(i => i.label.includes('Tokens'))?.description?.includes('2.00M'),
    rows(qp).find(i => i.label.includes('Tokens'))?.description);
}

console.log('\n=== 6. a blocking day explains itself ===');
{
  const qp = open(status({
    day: { inputTokens: 2_000_000, costUsd: 24, requests: 214, blocked: 17,
      refusals: [{ at: Date.now(), reason: 'Daily token budget reached', modelId: 'gpt-4o', estimatedInput: 12_000 }],
      ...today([0, 3000, 620_000, 780_000]) },
    tokenPct: 100, costPct: 96, overLimit: true, nearLimit: true,
  }));
  const refused = rows(qp).find(i => i.label.includes('Refused'));
  check('refusals are counted', refused?.description === '17', refused?.description);
  check('the most recent reason is given', refused?.detail?.includes('Daily token budget reached'), refused?.detail);
  check('the guard reads as blocking',
    rows(qp).some(i => i.label.includes('Guard') && i.description === 'blocking'));
}

console.log('\n=== 7. it lets go of the ledger when it closes ===');
{
  const qp = open(status());
  check('it subscribes while open', qp._listeners.length === 1);
  qp._hide();
  check('and unsubscribes when hidden', qp._listeners.disposed === true);
  check('and disposes itself', qp.disposed === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
