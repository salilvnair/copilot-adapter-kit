/**
 * Answers the Developer Tools protocol when there is no extension host.
 *
 * The three tabs talk to SQLite, which only exists inside VS Code. Without this
 * they render their empty state forever on the dev server, so neither the
 * screenshots nor the browser tests could see a populated table — the parts
 * most likely to be wrong.
 *
 * DEV only, and it never loads in a packaged build: the import is behind
 * `import.meta.env.DEV`, so Vite drops the whole module from the bundle.
 */

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

const AI_ROWS = [
  {
    audit_id: 9, conversation_id: 'a3f9c1d20b74e855', stage: 'chat.complete',
    provider: 'deepseek', model: 'deepseek-chat',
    meta: JSON.stringify({ messages: 14, tools: 64, maxTokens: 16384, estimated: false, bodiesRecorded: false }),
    headers: JSON.stringify({ apiPath: '/chat/completions' }),
    input_tokens: 18422, output_tokens: 1204, cost_usd: 0.0061, duration_ms: 2840,
    created_at: iso(3),
  },
  {
    audit_id: 8, conversation_id: 'a3f9c1d20b74e855', stage: 'chat.refused',
    provider: 'openai', model: 'gpt-4o',
    error: 'Daily token budget reached — 2.00M of 2.00M used',
    meta: JSON.stringify({ messages: 22, tools: 64, estimated: true, bodiesRecorded: false }),
    input_tokens: 118_400, output_tokens: 0, duration_ms: 4,
    created_at: iso(11),
  },
  {
    audit_id: 7, conversation_id: '7c2e5b9910aa4431', stage: 'git.commit',
    provider: 'groq', model: 'llama-3.3-70b',
    user_prompt: 'Write a conventional commit message for the staged diff.',
    response_payload: JSON.stringify({ choices: [{ message: { content: 'fix: guard against a null provider entry' } }] }),
    input_tokens: 3120, output_tokens: 88, cost_usd: 0.0004, duration_ms: 640,
    created_at: iso(26),
  },
  {
    audit_id: 6, conversation_id: '7c2e5b9910aa4431', stage: 'chat.error',
    provider: 'anthropic', model: 'claude-sonnet-5',
    error: 'connect ETIMEDOUT 10.0.0.4:443',
    input_tokens: 2400, output_tokens: 0, duration_ms: 30_012,
    created_at: iso(48),
  },
  {
    audit_id: 5, conversation_id: 'd1b8aa4409f2c6e3', stage: 'vision.describe',
    provider: 'openai', model: 'gpt-4o',
    meta: JSON.stringify({ images: 1, fallback: true }),
    input_tokens: 1850, output_tokens: 310, cost_usd: 0.0072, duration_ms: 1920,
    created_at: iso(75),
  },
];

const UI_ROWS = [
  { id: 41, audit_id: 41, event_type: 'provider.save',  module: 'Providers',   button: 'Save provider', action: 'update', metadata: JSON.stringify({ family: 'deepseek', baseUrl: 'https://api.deepseek.com/v1' }), created_at: iso(1) },
  { id: 40, audit_id: 40, event_type: 'key.set',        module: 'API Keys',    button: 'Save key',      action: 'create', metadata: JSON.stringify({ provider: 'deepseek' }), created_at: iso(2) },
  { id: 39, audit_id: 39, event_type: 'guard.limit',    module: 'Spend Guard', button: 'Limit stepper', action: 'update', metadata: JSON.stringify({ key: 'budget.dailyTokenLimit', from: 1_000_000, to: 2_000_000 }), created_at: iso(9) },
  { id: 38, audit_id: 38, event_type: 'model.toggle',   module: 'Models',      button: 'Picker switch', action: 'update', metadata: JSON.stringify({ id: 'deepseek-reasoner', visible: false }), created_at: iso(14) },
  { id: 37, audit_id: 37, event_type: 'audit.export',   module: 'Audit',       button: 'Export',        action: 'read',   created_at: iso(31) },
  { id: 36, audit_id: 36, event_type: 'danger.bin_clear', module: 'Danger Zone', button: 'Empty the Bin', action: 'delete', metadata: JSON.stringify({ providers: 1, models: 3 }), created_at: iso(64) },
];

const TABLES = [
  {
    name: 'cak_audit', rowCount: AI_ROWS.length,
    columns: ['audit_id', 'conversation_id', 'stage', 'provider', 'model', 'input_tokens',
      'output_tokens', 'cost_usd', 'duration_ms', 'error', 'meta', 'created_at'],
  },
  {
    name: 'ui_audit', rowCount: UI_ROWS.length,
    columns: ['id', 'event_type', 'module', 'button', 'action', 'metadata', 'created_at'],
  },
];

const reply = (msg: unknown) => window.postMessage(msg, '*');

/** Present only when the panel is running inside the editor. */
function vscodeApi(): unknown {
  return (window as { __cakVscode?: unknown }).__cakVscode
    ?? (typeof (window as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === 'function' ? true : undefined);
}

let installed = false;

export function installDevToolsFixture(): void {
  // Inside VS Code the real host answers; this must never shadow it.
  if (installed || vscodeApi()) return;
  installed = true;

  window.addEventListener('cak:post', (e: Event) => {
    const { type, payload } = (e as CustomEvent).detail ?? {};
    switch (type) {
      case 'aiAudit:load':
        reply({ type: 'aiAudit:data', entries: AI_ROWS });
        break;
      case 'uiAudit:load':
        reply({ type: 'uiAudit:data', entries: UI_ROWS });
        break;
      case 'aiAudit:clear':
      case 'uiAudit:clear':
        break;
      case 'dbExplorer:getTables':
        reply({ type: 'dbExplorer:tables', tables: TABLES });
        break;
      case 'dbExplorer:getRows': {
        const name = payload?.tableName;
        const table = TABLES.find(t => t.name === name);
        reply({
          type: 'dbExplorer:rows',
          tableName: name,
          columns: table?.columns ?? [],
          rows: name === 'cak_audit' ? AI_ROWS : name === 'ui_audit' ? UI_ROWS : [],
        });
        break;
      }
      case 'dbExplorer:deleteRow':
        reply({ type: 'dbExplorer:rowDeleted', ok: true });
        break;
    }
  });
}
