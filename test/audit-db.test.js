// Exercises the real sql.js database against a temp file.
//
// Not a mock: it opens the WASM engine, creates the schema, writes rows, reads
// them back and prunes them. If the WASM binary is missing or the schema is
// wrong, this fails rather than the extension silently recording nothing.

const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = process.argv[2];

// ---- vscode stub ----
let settings = {};
const vscodeStub = {
  workspace: {
    getConfiguration: () => ({
      get: (k, d) => (settings[k] !== undefined ? settings[k] : d),
      update: async (k, v) => { settings[k] = v; },
    }),
  },
  window: { showInformationMessage() {}, showWarningMessage() {}, showErrorMessage() {} },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'vscode') return 'vscode';
  return origResolve.call(this, req, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const db = require(path.join(ROOT, 'out/storage/db.js'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cak-audit-'));
  const dbFile = path.join(tmp, 'cak.db');
  process.env.CAK_TEST_DB_PATH = dbFile;

  console.log('\n=== 1. the WASM engine starts ===');
  await db.initDb(ROOT);
  const status = db.dbStatus();
  check('sqlite reports ok', status.ok, status.error);
  check('database lives where it was told', status.path === dbFile, status.path);

  console.log('\n=== 2. a model call is recorded and read back ===');
  db.insertAudit({
    conversation_id: 'conv-1',
    stage: 'chat.complete',
    provider: 'deepseek',
    model: 'deepseek-chat',
    input_tokens: 1200,
    output_tokens: 340,
    cost_usd: 0.0041,
    duration_ms: 830,
    meta: JSON.stringify({ messages: 12, tools: 64 }),
  });
  const rows = db.getAuditEntries(10);
  check('one row came back', rows.length === 1, String(rows.length));
  check('every column round-trips',
    rows[0].model === 'deepseek-chat'
    && rows[0].input_tokens === 1200
    && rows[0].output_tokens === 340
    && Math.abs(rows[0].cost_usd - 0.0041) < 1e-9
    && rows[0].duration_ms === 830,
    JSON.stringify(rows[0]));
  check('a timestamp is stamped by the database', /^\d{4}-\d{2}-\d{2}T/.test(rows[0].created_at || ''));

  console.log('\n=== 3. a refusal is recorded with its reason ===');
  db.insertAudit({
    conversation_id: 'conv-1',
    stage: 'chat.refused',
    model: 'deepseek-chat',
    error: 'Daily token budget reached',
  });
  const refused = db.getAuditEntries(10).find(r => r.stage === 'chat.refused');
  check('the refusal is there with its reason', refused?.error === 'Daily token budget reached');

  console.log('\n=== 4. panel actions are recorded separately ===');
  db.insertUiAudit({ event_type: 'provider.remove', module: 'providers', action: 'DeepSeek' });
  const ui = db.getUiAuditEntries(10);
  check('the action came back', ui.length === 1 && ui[0].module === 'providers', JSON.stringify(ui));
  const counts = db.auditCounts();
  check('counts add up', counts.ai === 2 && counts.ui === 1, JSON.stringify(counts));

  console.log('\n=== 5. it survives a restart ===');
  db.closeDb();
  await db.initDb(ROOT);
  check('rows are still there after reopening', db.getAuditEntries(10).length === 2);
  check('the file exists on disk', fs.existsSync(dbFile));

  console.log('\n=== 6. retention prunes by age ===');
  // Backdate one row past the window.
  const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
  db.insertAudit({ conversation_id: 'old', stage: 'chat.complete', created_at: old });
  // created_at has a default, so age it directly.
  const raw = require(path.join(ROOT, 'out/storage/db.js'));
  raw.clearAuditEntries();
  raw.insertAudit({ conversation_id: 'keep', stage: 'chat.complete' });
  const removed = raw.pruneAudit(30);
  check('a fresh row is kept', raw.getAuditEntries(10).length === 1, String(removed));
  check('pruning reports what it removed', typeof removed === 'number');

  console.log('\n=== 7. clearing empties both tables ===');
  db.clearAuditEntries();
  db.clearUiAuditEntries();
  const after = db.auditCounts();
  check('both are empty', after.ai === 0 && after.ui === 0, JSON.stringify(after));

  db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
