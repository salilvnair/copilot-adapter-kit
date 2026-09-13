// Exercises the spend guard against a stubbed VS Code + stubbed engine.
const Module = require('module');
const path = require('path');
const ROOT = process.argv[2];

// ---- vscode stub ----
let settings = {};
const notices = [];
const vscodeStub = {
  workspace: {
    getConfiguration: () => ({
      get: (k, d) => (settings[k] !== undefined ? settings[k] : d),
      update: async (k, v) => { settings[k] = v; },
    }),
  },
  window: {
    showWarningMessage: (m) => { notices.push(m); return Promise.resolve(undefined); },
    createOutputChannel: () => ({ info() {}, warn() {}, error() {} }),
  },
  Disposable: class { constructor(fn) { this.dispose = fn; } },
  commands: { executeCommand: async () => {} },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'vscode') return 'vscode';
  return origResolve.call(this, req, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const { BudgetLedger, parsePricingUsd } = require(path.join(ROOT, 'out/kernel/budget.js'));
const { BudgetWarden } = require(path.join(ROOT, 'out/crosscut/budget-warden.js'));
const { InterceptorPipeline } = require(path.join(ROOT, 'out/mesh/pipeline.js'));
const { estimateTokens } = require(path.join(ROOT, 'out/tooling/token-math.js'));

// ---- fake extension context ----
const store = new Map();
const ext = { globalState: { get: (k) => store.get(k), update: async (k, v) => { store.set(k, v); } } };

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

// ---- fake engine that records what it was sent ----
function makeEngine(usage) {
  const seen = [];
  return {
    seen,
    engine: {
      family: 'openai',
      async stream(payload, sink) {
        seen.push(JSON.parse(JSON.stringify(payload)));
        sink.onToken('hello world response');
        if (usage) sink.onReport && sink.onReport(usage);
        sink.onComplete();
      },
    },
  };
}

function sink() {
  const out = { text: '', faults: [], completed: false };
  return {
    out,
    s: {
      onToken: (t) => { out.text += t; },
      onThinking: () => {},
      onToolSignal: () => {},
      onFault: async (e) => { out.faults.push(e); },
      onComplete: () => { out.completed = true; },
    },
  };
}

function msgs(chars) {
  return [{ role: 'user', content: 'x'.repeat(chars) }];
}

(async () => {
  console.log('\n=== 1. estimator is conservative (never below chars/4) ===');
  const code = 'const x = foo.bar({ a: 1, b: [2,3] }); // comment\n'.repeat(20);
  const naive = Math.ceil(code.length / 4);
  const est = estimateTokens(code);
  check('code estimate >= naive chars/4', est >= naive, `${est} vs ${naive}`);
  check('CJK counted near 1 tok/char', estimateTokens('日本語テキスト') >= 6, String(estimateTokens('日本語テキスト')));

  console.log('\n=== 2. unbounded output is capped ===');
  settings = {};
  let ledger = new BudgetLedger(ext);
  let pipe = new InterceptorPipeline();
  pipe.use(new BudgetWarden(ledger));
  let e = makeEngine({ prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 });
  let sk = sink();
  await pipe.wrap(e.engine).stream(
    { model: 'm', stream: true, messages: msgs(100), max_tokens: undefined, _budget: { pickerId: 'm', maxOut: 8192 } },
    sk.s,
  );
  check('max_tokens filled from model maxOut', e.seen[0].max_tokens === 8192, String(e.seen[0].max_tokens));

  sk = sink(); e = makeEngine(null);
  await pipe.wrap(e.engine).stream(
    { model: 'm', stream: true, messages: msgs(100), _budget: { pickerId: 'm' } }, sk.s);
  check('no maxOut -> hard fallback 16384', e.seen[0].max_tokens === 16384, String(e.seen[0].max_tokens));

  settings['budget.maxOutputTokens'] = 4096;
  sk = sink(); e = makeEngine(null);
  await pipe.wrap(e.engine).stream(
    { model: 'm', stream: true, messages: msgs(100), max_tokens: 99999, _budget: { pickerId: 'm', maxOut: 65536 } }, sk.s);
  check('budget cap overrides a larger user value', e.seen[0].max_tokens === 4096, String(e.seen[0].max_tokens));
  delete settings['budget.maxOutputTokens'];

  console.log('\n=== 3. per-request input ceiling blocks before the network ===');
  settings = { 'budget.maxInputTokensPerRequest': 1000 };
  ledger = new BudgetLedger(ext); pipe = new InterceptorPipeline(); pipe.use(new BudgetWarden(ledger));
  e = makeEngine(null); sk = sink();
  await pipe.wrap(e.engine).stream(
    { model: 'm', stream: true, messages: msgs(500000), _budget: { pickerId: 'm' } }, sk.s);
  check('engine never called', e.seen.length === 0);
  check('fault raised', sk.out.faults.length === 1 && /blocked by the spend guard/i.test(sk.out.faults[0].message));
  check('blocked counter incremented', ledger.today.blocked === 1, String(ledger.today.blocked));
  check('no tokens charged for a blocked request',
    ledger.today.inputTokens === 0 && ledger.today.outputTokens === 0);

  console.log('\n=== 4. daily token budget stops the run ===');
  settings = { 'budget.dailyTokenLimit': 5000 };
  ledger = new BudgetLedger(ext); pipe = new InterceptorPipeline(); pipe.use(new BudgetWarden(ledger));
  let sent = 0, blocked = 0;
  for (let i = 0; i < 20; i++) {
    e = makeEngine({ prompt_tokens: 900, completion_tokens: 100, total_tokens: 1000 });
    sk = sink();
    await pipe.wrap(e.engine).stream(
      { model: 'm', stream: true, messages: msgs(200), _budget: { pickerId: 'm' } }, sk.s);
    if (e.seen.length) sent++; else blocked++;
  }
  check('stops after ~5 requests of 1000 tok', sent >= 4 && sent <= 6, `sent=${sent} blocked=${blocked}`);
  check('remaining requests all blocked', blocked === 20 - sent, `blocked=${blocked}`);
  check('ledger total near the limit', ledger.today.inputTokens + ledger.today.outputTokens <= 6000);

  console.log('\n=== 5. agent loop guard (the overnight scenario) ===');
  settings = { 'budget.maxTurnsPerConversation': 10, 'budget.dailyTokenLimit': 0, 'budget.dailyCostLimitUsd': 0 };
  ledger = new BudgetLedger(ext); pipe = new InterceptorPipeline(); pipe.use(new BudgetWarden(ledger));
  sent = 0; blocked = 0;
  const conversation = [{ role: 'user', content: 'build me a thing' }, { role: 'assistant', content: 'ok' }];
  for (let turn = 0; turn < 500; turn++) {
    e = makeEngine({ prompt_tokens: 120000, completion_tokens: 800, total_tokens: 120800 });
    sk = sink();
    // Same conversation head each turn — exactly what an agent tool loop sends.
    await pipe.wrap(e.engine).stream(
      { model: 'm', stream: true, messages: conversation.concat([{ role: 'user', content: 'tool result ' + turn }]), _budget: { pickerId: 'm' } },
      sk.s);
    if (e.seen.length) sent++; else blocked++;
  }
  check('loop cut off at the turn limit', sent === 10, `sent=${sent}`);
  check('490 runaway turns refused', blocked === 490, `blocked=${blocked}`);
  const wouldHaveBeen = 500 * 120800;
  check('tokens spent 1.2M instead of 60M',
    ledger.today.inputTokens + ledger.today.outputTokens < wouldHaveBeen / 40,
    `${ledger.today.inputTokens + ledger.today.outputTokens} vs ${wouldHaveBeen}`);

  console.log('\n=== 6. cost accounting ===');
  check('pricing "in $3.00 / out $15.00" parses',
    JSON.stringify(parsePricingUsd('in $3.00 / out $15.00')) === '{"input":3,"output":15}',
    JSON.stringify(parsePricingUsd('in $3.00 / out $15.00')));
  settings = { 'budget.dailyCostLimitUsd': 1, 'budget.dailyTokenLimit': 0, 'budget.maxTurnsPerConversation': 0 };
  ledger = new BudgetLedger(ext); pipe = new InterceptorPipeline(); pipe.use(new BudgetWarden(ledger));
  sent = 0;
  for (let i = 0; i < 10; i++) {
    e = makeEngine({ prompt_tokens: 100000, completion_tokens: 10000, total_tokens: 110000 });
    sk = sink();
    await pipe.wrap(e.engine).stream(
      { model: 'm', stream: true, messages: msgs(200), _budget: { pickerId: 'm', pricing: 'in $3.00 / out $15.00' } }, sk.s);
    if (e.seen.length) sent++;
  }
  // $0.30 input + $0.15 output = $0.45 per request -> blocks on the 3rd
  check('cost limit blocks after ~2 requests at $0.45 each', sent === 3, `sent=${sent}, spent=$${ledger.today.costUsd.toFixed(2)}`);
  check('cost tracked per model', ledger.today.byModel['m'].costUsd > 0.9, String(ledger.today.byModel['m'].costUsd));

  console.log('\n=== 7. override really removes the caps ===');
  settings = { 'budget.enforce': false, 'budget.dailyTokenLimit': 1, 'budget.maxTurnsPerConversation': 1 };
  ledger = new BudgetLedger(ext); pipe = new InterceptorPipeline(); pipe.use(new BudgetWarden(ledger));
  sent = 0;
  for (let i = 0; i < 5; i++) {
    e = makeEngine({ prompt_tokens: 999999, completion_tokens: 1, total_tokens: 1000000 });
    sk = sink();
    await pipe.wrap(e.engine).stream(
      { model: 'm', stream: true, messages: msgs(200), _budget: { pickerId: 'm' } }, sk.s);
    if (e.seen.length) sent++;
  }
  check('nothing blocked when the guard is off', sent === 5, `sent=${sent}`);
  check('usage still recorded while uncapped', ledger.today.inputTokens > 4000000, String(ledger.today.inputTokens));
  check('status reports overLimit for the UI', ledger.status().overLimit === true);

  console.log('\n=== 8. estimated fallback when the provider reports nothing ===');
  settings = { 'budget.dailyTokenLimit': 0, 'budget.dailyCostLimitUsd': 0, 'budget.maxTurnsPerConversation': 0 };
  ledger = new BudgetLedger(ext); pipe = new InterceptorPipeline(); pipe.use(new BudgetWarden(ledger));
  e = makeEngine(null); sk = sink();
  await pipe.wrap(e.engine).stream(
    { model: 'm', stream: true, messages: msgs(40000), _budget: { pickerId: 'm' } }, sk.s);
  check('input estimated when no usage frame', ledger.today.inputTokens > 5000, String(ledger.today.inputTokens));
  check('flagged as estimated', ledger.today.estimated === true);

  console.log('\n=== 9. internal fields never reach the provider ===');
  const { OpenAIEngine } = require(path.join(ROOT, 'out/mesh/engines/openai/openai-engine.js'));
  const oe = new OpenAIEngine('openai');
  oe.configure('https://example.invalid/v1', 'k');
  let bodySeen = null;
  global.fetch = async (_url, init) => { bodySeen = JSON.parse(init.body); return { ok: false, status: 500, text: async () => '{}' }; };
  await oe.stream({ model: 'm', stream: true, messages: [], apiPath: '/chat/completions', _budget: { pickerId: 'm' }, _visionFallback: { model: 'v', family: 'f' } }, { onFault: () => {} });
  check('_budget stripped from request body', bodySeen && bodySeen._budget === undefined);
  check('_visionFallback stripped from request body', bodySeen && bodySeen._visionFallback === undefined);
  check('apiPath stripped from request body', bodySeen && bodySeen.apiPath === undefined);
  check('real fields preserved', bodySeen && bodySeen.model === 'm' && bodySeen.stream === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
