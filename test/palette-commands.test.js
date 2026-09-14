// The palette commands write what the rest of the extension reads.
//
// They were a second, older way of doing what the settings panel does, and the
// two had drifted into different data shapes. Add Provider wrote a provider
// with no `family` field, keyed by the family name; every lookup resolves
// providers BY family, so a provider added this way could never be found. Add
// Model wrote a flat array, while model-catalog reads a map keyed by provider
// UUID and drops an array outright — so those models were invisible.
//
// Nothing failed loudly. You added a provider, added a model, and the model
// simply was not in the picker.
//
// These tests drive the real command handlers against a fake settings store and
// then read the result back through the real consumers.

const Module = require('module');
const path = require('path');
const ROOT = process.argv[2];

/* ── a settings store the commands can write to ──────────────────────────── */
let settings = {};
let secrets = {};
const shown = [];
/** Queued answers for each prompt, in order. */
let answers = [];
const next = () => (answers.length ? answers.shift() : undefined);

const vscodeStub = {
  workspace: {
    getConfiguration: () => ({
      get: (k, d) => (settings[k] !== undefined ? settings[k] : d),
      update: async (k, v) => { settings[k] = JSON.parse(JSON.stringify(v)); },
    }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
  window: {
    showQuickPick: async () => next(),
    showInputBox: async () => next(),
    showInformationMessage: async (m) => { shown.push(m); return undefined; },
    showWarningMessage: async (m) => { shown.push(m); return next(); },
    showErrorMessage: async (m) => { shown.push(m); return undefined; },
      createStatusBarItem: () => ({ show() {}, dispose() {}, text: '', tooltip: undefined, backgroundColor: undefined }),
    registerWebviewViewProvider: () => ({ dispose() {} }),
    createQuickPick: () => ({ items: [], buttons: [], onDidTriggerButton() {}, onDidAccept() {},
                              onDidHide() {}, show() {}, hide() {}, dispose() {} }),
  },
  commands: { registerCommand: (id, run) => ({ id, run, dispose() {} }), executeCommand: async () => {} },
  ConfigurationTarget: { Global: 1 },
  StatusBarAlignment: { Right: 2 },
  ThemeColor: class { constructor(id) { this.id = id; } },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  MarkdownString: class { constructor() { this.value = ''; } appendMarkdown(m) { this.value += m; return this; } },
  Uri: { file: p => ({ fsPath: p }) },
  EventEmitter: class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} },
  QuickPickItemKind: { Separator: -1 },
  ExtensionMode: { Development: 2 },
  lm: { selectChatModels: async () => [], registerLanguageModelChatProvider: () => ({ dispose() {} }) },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'vscode') return 'vscode';
  return origResolve.call(this, req, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const ctx = {
  bridge: { signal() {} },
  tracer: { info() {}, openDumpsFolder() {} },
  get tuning() { return new Tuning(); },
  discovery: { families: () => ['openai', 'deepseek', 'anthropic'] },
  vault: { fetch: async () => undefined, present: async () => false },
  budget: { status: () => ({
    caps: { enforce: true, dailyTokenLimit: 0, dailyCostLimitUsd: 0, maxOutputTokens: 0 },
    day: { day: '2026-09-14', inputTokens: 0, outputTokens: 0, costUsd: 0, requests: 0, blocked: 0,
           byModel: {}, hourly: new Array(24).fill(0), hourlyCost: new Array(24).fill(0), refusals: [] },
    history: [], tokenPct: 0, costPct: 0, overLimit: false, nearLimit: false }),
    onChange: () => ({ dispose() {} }) },
};

const { resolveCatalog } = require(path.join(ROOT, 'out/conduit/model-catalog.js'));
const { Tuning } = require(path.join(ROOT, 'out/kernel/tuning.js'));

// activate() also opens the database and builds the whole object graph, none of
// which this suite is about — only the command wiring is.
require.cache[require.resolve(path.join(ROOT, 'out/storage/db.js'))] = {
  id: 'db', filename: 'db', loaded: true,
  exports: { initDb: async () => {}, pruneAudit: () => 0, insertUiAudit() {}, insertAudit() {},
             closeDb() {}, dbStatus: () => ({ ok: false }), auditCounts: () => ({ ai: 0, ui: 0 }),
             getAuditEntries: () => [], getUiAuditEntries: () => [] },
};
require.cache[require.resolve(path.join(ROOT, 'out/kernel/context.js'))] = {
  id: 'context', filename: 'context', loaded: true,
  exports: { Context: { bootstrap: async () => ctx } },
};

// Required last: it pulls in the two modules stubbed above.
const entry = require(path.join(ROOT, 'out/entry.js'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

/** entry.ts keeps its commands private, so they are reached through activate. */
const registered = new Map();

// The command bodies are closures over ctx; re-registering them here is how the
// real wiring in activate() is exercised without a VS Code host.
vscodeStub.commands.registerCommand = (id, run) => { registered.set(id, run); return { dispose() {} }; };

(async () => {
  // activate() does far more than register commands, so only the registration
  // block is reached — by calling it and tolerating the rest.
  try { await entry.activate({
    subscriptions: [], extensionPath: ROOT, extensionMode: 2,
    secrets: { get: async k => secrets[k], store: async (k, v) => { secrets[k] = v; }, delete: async k => { delete secrets[k]; } },
    globalState: { get: () => undefined, update: async () => {} },
    extension: { packageJSON: { version: '0.0.0-test' } },
  }); } catch { /* the rest of activate needs a real host */ }

  const run = async (id) => {
    const fn = registered.get(id);
    if (!fn) throw new Error(`command not registered: ${id}`);
    return fn();
  };

  console.log('\n=== 1. Add Provider writes a provider the lookups can find ===');
  {
    settings = {};
    answers = [
      { label: 'DeepSeek', description: 'deepseek', value: 'deepseek' },   // family
      'https://api.deepseek.com/v1',                                       // base URL
      '',                                                                  // aliases
    ];
    await run('copilot-adapter-kit.addProvider');

    const providers = settings['providers'] || {};
    const rows = Object.entries(providers);
    check('one provider was written', rows.length === 1, JSON.stringify(providers));

    const [key, cfg] = rows[0] ?? ['', {}];
    check('it carries its family as a field', cfg.family === 'deepseek', JSON.stringify(cfg));
    check('it is keyed by a uuid, not by the family name',
      key !== 'deepseek' && /^[0-9a-f-]{36}$/.test(key), key);
    check('the base URL is stored', cfg.baseUrl === 'https://api.deepseek.com/v1', cfg.baseUrl);

    // The actual consumer: this is what the bridge calls to find a provider.
    const tuning = new Tuning();
    check('providerUuidByFamily finds it — the whole point of the family field',
      tuning.providerUuidByFamily('deepseek') === key, String(tuning.providerUuidByFamily('deepseek')));
    check('provider() resolves it by family', tuning.provider('deepseek').baseUrl === cfg.baseUrl);
    check('and by uuid', tuning.provider(key).baseUrl === cfg.baseUrl);
  }

  console.log('\n=== 2. Add Model writes into the map the catalog reads ===');
  {
    const uuid = Object.keys(settings['providers'])[0];
    // A second provider, so step 2 actually shows the picker rather than
    // silently taking the only one there is.
    settings['providers']['other-uuid'] = {
      uuid: 'other-uuid', family: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    };

    answers = [
      'deepseek-chat',                                                  // id
      { label: 'DeepSeek', value: uuid, family: 'deepseek' },           // provider
      'DeepSeek Chat',                                                  // name
      { label: '128K', value: 128000 },                                 // context window
      { label: '16K', value: 16384 },                                   // max output
      { label: 'Yes', value: true },                                    // vision
      { label: 'No', value: false },                                    // thinking
      { label: '64', value: 64 },                                       // tools
    ];
    await run('copilot-adapter-kit.addModel');

    const models = settings['models'];
    check('models is a map, not an array', !!models && !Array.isArray(models), JSON.stringify(models));
    check('it is keyed by the provider uuid', !!models?.[uuid], Object.keys(models ?? {}).join(', '));

    // The consumer that decides what Copilot is offered.
    const catalog = resolveCatalog();
    check('the model reaches the catalog — an array here made it invisible',
      catalog.some(m => m.id === 'deepseek-chat'), JSON.stringify(catalog.map(m => m.id)));
    const m = catalog.find(x => x.id === 'deepseek-chat');
    check('it carries the family of its provider', m?.family === 'deepseek', m?.family);
    check('it remembers which provider serves it', m?.parentUuid === uuid, m?.parentUuid);
  }

  console.log('\n=== 3. half-written settings do not take a command down ===');
  {
    // What user-edited JSON can actually contain.
    settings['providers'] = {
      'ok-uuid': { uuid: 'ok-uuid', family: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      'broken': null,
      'alsobroken': 'not-an-object',
      'nourl': { uuid: 'nourl', family: 'groq' },
    };

    const tuning = new Tuning();
    let threw;
    try {
      tuning.provider('deepseek');
      tuning.providerUuidByFamily('deepseek');
      tuning.provider('openai');
    } catch (e) { threw = e.message; }
    check('resolving a provider never throws on malformed entries', !threw, threw);
    check('the good one is still found', tuning.providerUuidByFamily('openai') === 'ok-uuid');

    answers = [undefined];   // cancel the picker
    let cmdThrew;
    try { await run('copilot-adapter-kit.removeProvider'); } catch (e) { cmdThrew = e.message; }
    check('remove-provider survives a null entry beside a real one', !cmdThrew, cmdThrew);
  }

  console.log('\n=== 4. a failing command names itself ===');
  {
    shown.length = 0;
    const boom = registered.get('copilot-adapter-kit.addModel');
    settings['providers'] = { u: { uuid: 'u', family: 'openai', baseUrl: 'x' } };
    // Force a throw from inside the handler.
    const realPick = vscodeStub.window.showInputBox;
    vscodeStub.window.showInputBox = async () => { throw new Error('kaboom'); };
    await boom();
    vscodeStub.window.showInputBox = realPick;

    const msg = shown.join(' | ');
    check('the notification names the command', msg.includes('addModel'), msg);
    check('and carries the underlying message', msg.includes('kaboom'), msg);
    check('rather than surfacing as a bare TypeError',
      msg.includes('Copilot Adapter Kit:'), msg);
  }

  console.log('\n=== 5. no emoji in anything the user is shown ===');
  {
    const src = require('fs').readFileSync(path.join(ROOT, 'src/entry.ts'), 'utf8');
    const emoji = src.match(/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) ?? [];
    check('entry.ts is emoji-free', emoji.length === 0, emoji.join(' '));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
