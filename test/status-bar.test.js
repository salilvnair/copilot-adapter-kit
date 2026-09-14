// The status bar item and its hover.
//
// A hover cannot be screenshotted, so its markdown is asserted instead: the
// bar fills in proportion, the reset time is there, command links are present
// and trusted, and the item's own label never shows a bare "0" beside the icon.

const Module = require('module');
const path = require('path');
const ROOT = process.argv[2];

class MarkdownString {
  constructor() { this.value = ''; this.supportThemeIcons = false; this.isTrusted = false; }
  appendMarkdown(md) { this.value += md; return this; }
}
const vscodeStub = {
  MarkdownString,
  ThemeColor: class { constructor(id) { this.id = id; } },
  workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'vscode') return 'vscode';
  return origResolve.call(this, req, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const { paintStatus, buildTooltip } = require(path.join(ROOT, 'out/panel/status-bar.js'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

const status = (over = {}) => ({
  caps: {
    enforce: true, dailyTokenLimit: 2_000_000, dailyCostLimitUsd: 25,
    maxInputTokensPerRequest: 200_000, maxOutputTokens: 0, maxTurnsPerConversation: 50,
    ...(over.caps ?? {}),
  },
  day: {
    day: '2026-09-13', inputTokens: 0, outputTokens: 0, costUsd: 0,
    requests: 0, blocked: 0, estimated: false, byModel: {}, hourly: new Array(24).fill(0), refusals: [],
    ...(over.day ?? {}),
  },
  history: [],
  tokenPct: over.tokenPct ?? 0,
  costPct: over.costPct ?? 0,
  overLimit: over.overLimit ?? false,
  nearLimit: over.nearLimit ?? false,
});

const item = () => ({ text: '', tooltip: undefined, backgroundColor: undefined });

console.log('\n=== 1. the label says nothing until there is something to say ===');
{
  const i = item();
  paintStatus(i, status());
  check('a fresh day shows the mark alone', i.text === '$(cak-icon)', JSON.stringify(i.text));
  check('no "0" beside the icon', !/\b0\b/.test(i.text), i.text);
  check('no background while idle', i.backgroundColor === undefined);
}

console.log('\n=== 2. a percentage once there is usage ===');
{
  const i = item();
  paintStatus(i, status({ day: { inputTokens: 150_000, outputTokens: 10_000 }, tokenPct: 8, costPct: 4 }));
  check('shows the percentage', i.text === '$(cak-icon) 8%', i.text);
}

console.log('\n=== 3. states are distinguishable at a glance ===');
{
  const near = item();
  paintStatus(near, status({ day: { inputTokens: 1_700_000 }, tokenPct: 85, nearLimit: true }));
  check('near the limit warns', near.backgroundColor?.id === 'statusBarItem.warningBackground');

  const over = item();
  paintStatus(over, status({ day: { inputTokens: 2_000_000 }, tokenPct: 100, overLimit: true, nearLimit: true }));
  check('at the limit it says Blocking', over.text.includes('Blocking'), over.text);
  check('and turns red', over.backgroundColor?.id === 'statusBarItem.errorBackground');

  const off = item();
  paintStatus(off, status({ caps: { enforce: false } }));
  check('unguarded says so', off.text.includes('Uncapped'), off.text);
  check('and stays red', off.backgroundColor?.id === 'statusBarItem.errorBackground');
}

console.log('\n=== 4. the hover carries a bar per budget ===');
{
  const md = buildTooltip(status({
    day: { inputTokens: 500_000, outputTokens: 20_000, costUsd: 6.25, requests: 42 },
    tokenPct: 26, costPct: 25,
  }));
  const v = md.value;
  check('icons render', md.supportThemeIcons === true);
  check('command links are allowed', md.isTrusted === true);
  check('the product is named', v.includes('Copilot Adapter Kit'));
  check('tokens have a bar', /Tokens[\s\S]*█+░+/.test(v));
  check('cost has a bar', /Cost[\s\S]*█+░+/.test(v));

  // 26% of twenty cells is five filled.
  const firstBar = v.match(/█+░+/)[0];
  const filled = (firstBar.match(/█/g) || []).length;
  check('the bar fills in proportion', filled === 5, `${filled} of 20 for 26%`);
  check('twenty cells wide', firstBar.length === 20, String(firstBar.length));

  check('says when it resets', /Resets \w+ \d+/.test(v), v.slice(0, 200));
  check('reports the figures', v.includes('520.0K') && v.includes('$6.25'), v.slice(0, 400));
  check('reports requests', v.includes('| Requests | 42 |'));
  check('offers the panel', v.includes('command:copilot-adapter-kit.openPanel'));
  check('offers the dashboard', v.includes('command:copilot-adapter-kit.showUsage'));
}

console.log('\n=== 5. the hover changes with the state ===');
{
  const blocked = buildTooltip(status({
    day: { inputTokens: 2_000_000, costUsd: 24, requests: 214, blocked: 17 },
    tokenPct: 100, costPct: 96, overLimit: true,
  })).value;
  check('a full bar at the limit', /█{20}/.test(blocked));
  check('blocked requests are counted', blocked.includes('| Blocked |'));
  check('the guard reads as blocking', blocked.includes('Blocking'));

  const off = buildTooltip(status({ caps: { enforce: false } })).value;
  check('an unguarded hover leads with the warning', off.indexOf('Spend guard is off') < off.indexOf('Tokens'));
  check('and offers to re-enable', off.includes('command:copilot-adapter-kit.enableSpendGuard'));

  const noLimit = buildTooltip(status({ caps: { dailyTokenLimit: 0 }, tokenPct: -1 })).value;
  check('no limit set says so instead of drawing a bar', noLimit.includes('no limit'));

  const estimated = buildTooltip(status({ day: { estimated: true } })).value;
  check('estimates are declared', estimated.includes('estimates'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
