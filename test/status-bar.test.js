// The status bar item and its hover.
//
// A hover cannot be screenshotted, so its markdown is asserted instead: the
// sparkline reflects the real hourly series, the reset time is there, command
// links are present and trusted, and the item's own label never shows a bare
// "0" beside the icon.

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

/** Sparkline cells, shortest to tallest. */
const LOW = '▁';
const HIGH = '█';
const CELLS = /[▁-█]+/g;

// The hover only draws the hours that have already happened, so the fixtures
// are built relative to the clock rather than pinned to a made-up morning.
const HOUR = new Date().getHours();
const DRAWN = HOUR + 1;
const SHAPED = HOUR >= 3;   // four cells is the least that can show a shape

/** Puts a shape in today's elapsed hours, oldest first, trimmed to fit. */
function today(values) {
  const hourly = new Array(24).fill(0);
  values.slice(0, DRAWN).forEach((v, i) => { hourly[i] = v; });
  return { hourly, hourlyCost: hourly.map(v => (v / 1e6) * 8) };
}

const status = (over = {}) => ({
  caps: {
    enforce: true, dailyTokenLimit: 2_000_000, dailyCostLimitUsd: 25,
    maxInputTokensPerRequest: 200_000, maxOutputTokens: 0, maxTurnsPerConversation: 50,
    ...(over.caps ?? {}),
  },
  day: {
    day: '2026-09-13', inputTokens: 0, outputTokens: 0, costUsd: 0,
    requests: 0, blocked: 0, estimated: false, byModel: {},
    hourly: new Array(24).fill(0), hourlyCost: new Array(24).fill(0), refusals: [],
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

console.log('\n=== 4. the hover draws the day rather than filling a bar ===');
{
  // Quiet, then a hard spike, then a long tail down.
  const day = today([1_000, 40_000, 400_000, 150_000, 60_000, 10_000]);
  const md = buildTooltip(status({
    day: { inputTokens: 500_000, outputTokens: 20_000, costUsd: 6.25, requests: 42, ...day },
    tokenPct: 26, costPct: 25,
  }));
  const v = md.value;

  check('icons render', md.supportThemeIcons === true);
  check('command links are allowed', md.isTrusted === true);
  check('the product is named', v.includes('Copilot Adapter Kit'));

  const sparks = v.match(CELLS) ?? [];
  check('one sparkline per budget', sparks.length === 2, String(sparks.length));

  const spark = sparks[0] ?? '';
  check('only the hours so far are drawn', spark.length === DRAWN, `${spark.length} of ${DRAWN}`);

  if (SHAPED) {
    check('the busiest hour is the tallest cell', spark[2] === HIGH, JSON.stringify(spark));
    check('a quiet hour is the shortest', spark[0] === LOW, JSON.stringify(spark));
    check('the spike stands above the hour that followed',
      spark.charCodeAt(2) > spark.charCodeAt(3), JSON.stringify(spark));
    check('the curve has shape — a fill bar would not',
      new Set(spark.split('')).size > 2, JSON.stringify(spark));
  } else {
    console.log(`  SKIP  shape assertions (only ${DRAWN} hour(s) elapsed today)`);
  }

  check('says when it resets', /Resets \w+ \d+/.test(v), v.slice(0, 200));
  check('reports the figures', v.includes('520.0K') && v.includes('$6.25'), v.slice(0, 400));
  check('reports requests', v.includes('| Requests | 42 |'));
  check('offers the panel', v.includes('command:copilot-adapter-kit.openPanel'));
  check('offers the dashboard', v.includes('command:copilot-adapter-kit.showUsage'));
}

console.log('\n=== 5. the sparkline is scaled to the day it is drawing ===');
{
  // One burst against a trickle: the burst tops out, the trickle bottoms out.
  const day = today([5_000, 2_000_000]);
  const burst = buildTooltip(status({
    day: { inputTokens: 2_005_000, costUsd: 24, requests: 214, blocked: 17, ...day },
    tokenPct: 100, costPct: 96, overLimit: true,
  })).value;

  const spark = (burst.match(CELLS) ?? [''])[0];
  if (DRAWN >= 2) {
    check('the burst is the tallest cell', spark[1] === HIGH, JSON.stringify(spark));
    check('the trickle beside it is the shortest', spark[0] === LOW, JSON.stringify(spark));
  } else {
    console.log('  SKIP  scale assertions (the day has barely started)');
  }
  check('hours that have not happened are not drawn as a quiet spell',
    spark.length === DRAWN, `${spark.length} of ${DRAWN}`);
  check('blocked requests are counted', burst.includes('| Blocked |'));
  check('the guard reads as blocking', burst.includes('Blocking'));
}

console.log('\n=== 6. the hover changes with the state ===');
{
  const off = buildTooltip(status({ caps: { enforce: false } })).value;
  check('an unguarded hover leads with the warning', off.indexOf('Spend guard is off') < off.indexOf('Tokens'));
  check('and offers to re-enable', off.includes('command:copilot-adapter-kit.enableSpendGuard'));

  const noLimit = buildTooltip(status({ caps: { dailyTokenLimit: 0 }, tokenPct: -1 })).value;
  check('no limit set says so instead of a percentage', noLimit.includes('no limit'));

  const quiet = buildTooltip(status()).value;
  check('an untouched day says so rather than drawing a flat line',
    quiet.includes('Nothing spent yet today'), quiet.slice(0, 300));
  check('and draws no sparkline at all', (quiet.match(CELLS) ?? []).length === 0);

  const estimated = buildTooltip(status({ day: { estimated: true } })).value;
  check('estimates are declared', estimated.includes('estimates'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
