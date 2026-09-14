// entry.ts — SpringApplication.run()
import vscode from 'vscode';
import { fmtTokens, type BudgetStatus } from './kernel/budget';
import { Context } from './kernel/context';
import { defaultUrlFor, KNOWN_FAMILIES } from './kernel/families';
import { paintStatus } from './panel/status-bar';
import { showStatusMenu } from './panel/status-menu';
import { closeDb, initDb, insertUiAudit, pruneAudit } from './storage/db';
import { MiniGitPanel } from './panel/MiniGitPanel';
import { SettingsPanel } from './panel/SettingsPanel';
import { SpendGuardPanel } from './panel/SpendGuardPanel';
import { WebviewHost } from './panel/webview-host';

let instance: Context | undefined;

export async function activate(ext: vscode.ExtensionContext): Promise<void> {
  // Before the context, so the first request of the session is auditable.
  await initDb(ext.extensionPath);
  const days = vscode.workspace.getConfiguration('copilot-adapter-kit')
    .get<number>('audit.retentionDays', 30);
  if (days > 0) pruneAudit(days);
  insertUiAudit({ event_type: 'extension.activate', module: 'core', action: ext.extension.packageJSON.version });

  const ctx = await Context.bootstrap(ext);
  instance = ctx;

  // Status bar entry — live spend readout. Hovering is the glance; clicking
  // opens the menu, which is where anything you can act on lives.
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'copilot-adapter-kit.statusMenu';
  const paint = (s: BudgetStatus) => paintStatus(status, s);
  paint(ctx.budget.status());
  status.show();
  ext.subscriptions.push(status, ctx.budget.onChange(paint));

  ext.subscriptions.push(
    _command(ctx, 'copilot-adapter-kit.openPanel',     () => SettingsPanel.show(ext, ctx)),
    _command(ctx, 'copilot-adapter-kit.setApiKey',     () => _promptKey(ctx)),
    _command(ctx, 'copilot-adapter-kit.clearApiKey',   () => _clearKey(ctx)),
    _command(ctx, 'copilot-adapter-kit.addModel',      () => _addModel(ctx)),
    _command(ctx, 'copilot-adapter-kit.removeModel',   () => _removeModel(ctx)),
    _command(ctx, 'copilot-adapter-kit.addProvider',   () => _addProvider(ctx)),
    _command(ctx, 'copilot-adapter-kit.removeProvider',() => _removeProvider(ctx)),
    _command(ctx, 'copilot-adapter-kit.configure',     () => _configure(ctx)),
    _command(ctx, 'copilot-adapter-kit.openSettings',  () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:salilvnair.copilot-adapter-kit')),
    _command(ctx, 'copilot-adapter-kit.showLogs',      () =>
      (vscode.window as any).showOutputChannel?.() || ctx.tracer.info('')),
    _command(ctx, 'copilot-adapter-kit.openDumps',     () => ctx.tracer.openDumpsFolder()),
    _command(ctx, 'copilot-adapter-kit.generateCommitMessage', () => _generateCommitMessage(ext, ctx)),
    _command(ctx, 'copilot-adapter-kit.statusMenu',         () => showStatusMenu(ctx)),
    _command(ctx, 'copilot-adapter-kit.showUsage',          () => SpendGuardPanel.show(ext, ctx)),
    _command(ctx, 'copilot-adapter-kit.resetBudget',        () => _resetBudget(ctx)),
    _command(ctx, 'copilot-adapter-kit.disableSpendGuard',  () => _setSpendGuard(ctx, false)),
    _command(ctx, 'copilot-adapter-kit.enableSpendGuard',   () => _setSpendGuard(ctx, true)),
  );

  // Development only — the parity harness is for checking the UI against the
  // approved mock, and has no meaning in an installed extension.
  if (ext.extensionMode === vscode.ExtensionMode.Development) {
    void vscode.commands.executeCommand('setContext', 'copilot-adapter-kit.dev', true);
    ext.subscriptions.push(
      vscode.commands.registerCommand('copilot-adapter-kit.openHarness', () => _openHarness(ext)),
    );
  }

  // Re-paint when the guard is toggled from settings.json rather than a command.
  ext.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('copilot-adapter-kit.budget')) paint(ctx.budget.status());
  }));

  if (!ctx.budget.caps.enforce) {
    void vscode.window.showWarningMessage(
      'Copilot Adapter Kit: the spend guard is OFF. Requests are uncapped and can run up unlimited provider charges.',
      'Re-enable',
    ).then(c => { if (c === 'Re-enable') void vscode.commands.executeCommand('copilot-adapter-kit.enableSpendGuard'); });
  }

  // Register sidebar mini git panel
  ext.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cak.miniGitPanel', new MiniGitPanel(ext, ctx)),
  );

  ctx.tracer.info(`copilot-adapter-kit v${ext.extension.packageJSON.version} activated`);
}

export async function deactivate(): Promise<void> {
  await instance?.bridge.signal();
  instance = undefined;
  closeDb();
}

async function _promptKey(ctx: Context): Promise<void> {
  const families = ctx.discovery.families();
  const family = families.length === 1 ? families[0] : await vscode.window.showQuickPick(families, {
    placeHolder: 'Select provider to set API key for',
    ignoreFocusOut: true,
  });
  if (!family) return;

  const k = await vscode.window.showInputBox({
    prompt: `Enter API key for ${family}`,
    placeHolder: family === 'openai' ? 'sk-...' : 'paste your key',
    password: true,
    ignoreFocusOut: true,
    validateInput: v => v?.trim() ? undefined : 'Cannot be empty',
  });
  if (k) {
    await ctx.vault.seal(family, k);
    vscode.window.showInformationMessage(`API key saved for ${family}.`);
    ctx.bridge.signal();
  }
}

async function _clearKey(ctx: Context): Promise<void> {
  const families = ctx.discovery.families();
  const family = families.length === 1 ? families[0] : await vscode.window.showQuickPick(families, {
    placeHolder: 'Select provider to clear API key for',
    ignoreFocusOut: true,
  });
  if (!family) return;

  await ctx.vault.revoke(family);
  ctx.bridge.signal();
  vscode.window.showInformationMessage(`API key removed for ${family}.`);
}

// ---- Add Model — step‑by‑step form UI (no JSON editing) ----

interface ModelFormData {
  id: string; name: string; family: string; detail: string;
  maxIn: number; maxOut: number; image: boolean; thinking: boolean; toolCalling: number;
}

const CONTEXT_SIZES = [
  { label: '4K',   value: 4096 },
  { label: '8K',   value: 8192 },
  { label: '16K',  value: 16384 },
  { label: '32K',  value: 32768 },
  { label: '64K',  value: 65536 },
  { label: '128K', value: 128000 },
  { label: '200K', value: 200000 },
  { label: '256K', value: 256000 },
  { label: '400K', value: 400000 },
  { label: '1M',   value: 1000000 },
  { label: '2M',   value: 2000000 },
];

// The sizes providers actually publish. 393216 is DeepSeek's max_tokens
// ceiling — 384K — and the reason this list no longer stops at 128K.
const OUTPUT_SIZES = [
  { label: '4K',   value: 4096 },
  { label: '8K',   value: 8192 },
  { label: '16K',  value: 16384 },
  { label: '32K',  value: 32768 },
  { label: '64K',  value: 65536 },
  { label: '100K', value: 100000 },
  { label: '128K', value: 128000 },
  { label: '200K', value: 200000 },
  { label: '300K', value: 300000 },
  { label: '393K', value: 393216 },
];

const TOOL_SIZES = [
  { label: 'None',  value: 0 },
  { label: '16',    value: 16 },
  { label: '32',    value: 32 },
  { label: '64',    value: 64 },
  { label: '128',   value: 128 },
];

/**
 * Register a command so a failure says which one failed and leaves a stack.
 *
 * A raw "Cannot read properties of undefined (reading 'family')" in a toast
 * names no command, no file and no line, which makes it unreportable and
 * unfixable. The notification now names the command and offers the log; the
 * output channel gets the stack.
 */
function _command(
  ctx: Context, id: string, run: () => unknown,
): vscode.Disposable {
  return vscode.commands.registerCommand(id, async () => {
    try {
      return await run();
    } catch (e) {
      const err = e as Error;
      const short = id.replace('copilot-adapter-kit.', '');
      ctx.tracer.info(`[command ${short}] ${err?.stack ?? err?.message ?? String(e)}`);
      const choice = await vscode.window.showErrorMessage(
        `Copilot Adapter Kit: "${short}" failed — ${err?.message ?? String(e)}`,
        'Show log', 'Open Settings',
      );
      if (choice === 'Show log') await vscode.commands.executeCommand('copilot-adapter-kit.showLogs');
      if (choice === 'Open Settings') await vscode.commands.executeCommand('copilot-adapter-kit.openPanel');
      return undefined;
    }
  });
}

async function _addModel(ctx: Context): Promise<void> {
  const form: Partial<ModelFormData> = {};

  // Step 1 — Model ID
  const id = await vscode.window.showInputBox({
    prompt: '1/8 — Model ID (e.g. llama3-8b, qwen-coder)',
    placeHolder: 'my-model',
    ignoreFocusOut: true,
    validateInput: v => v?.trim() ? undefined : 'Model ID is required',
  });
  if (!id) return;
  form.id = id.trim();

  // Step 2 — Which provider this model belongs to.
  //
  // It used to offer engine families instead, which meant a model could be
  // filed under a family with no provider behind it — it then never appeared
  // in the picker and nothing said why.
  const configured = Object.entries(ctx.tuning.providers);
  if (configured.length === 0) {
    const go = await vscode.window.showWarningMessage(
      'No providers are configured, so there is nothing to add a model to.',
      'Add a provider',
    );
    if (go) await vscode.commands.executeCommand('copilot-adapter-kit.addProvider');
    return;
  }
  const provPick = configured.length === 1
    ? { value: configured[0][0], family: configured[0][1].family ?? '' }
    : await vscode.window.showQuickPick(
        configured.map(([uuid, p]) => ({
          label: p.name || p.family || uuid,
          description: p.family ?? '',
          detail: p.baseUrl,
          value: uuid,
          family: p.family ?? '',
        })),
        { placeHolder: '2/8 — Which provider serves this model?', ignoreFocusOut: true },
      );
  if (!provPick) return;
  form.family = provPick.family;
  const parentUuid = provPick.value;

  // Step 3 — Display name
  const name = await vscode.window.showInputBox({
    prompt: '3/8 — Display name (shown in picker)',
    placeHolder: form.id,
    ignoreFocusOut: true,
  });
  if (name === undefined) return;
  form.name = name.trim() || form.id;

  // Step 4 — Context window size
  const ctxPick = await vscode.window.showQuickPick(
    [...CONTEXT_SIZES, { label: 'Custom...', value: -1 }],
    { placeHolder: '4/8 — Context window size', ignoreFocusOut: true },
  );
  if (!ctxPick) return;
  if (ctxPick.value === -1) {
    const custom = await vscode.window.showInputBox({
      prompt: 'Enter custom context window size (tokens)',
      placeHolder: '128000',
      validateInput: v => /^\d+$/.test(v || '') ? undefined : 'Must be a number',
      ignoreFocusOut: true,
    });
    if (!custom) return;
    form.maxIn = parseInt(custom, 10);
  } else {
    form.maxIn = ctxPick.value;
  }

  // Step 5 — Max output tokens
  const outPick = await vscode.window.showQuickPick(
    [...OUTPUT_SIZES, { label: 'Custom...', value: -1 }],
    { placeHolder: '5/8 — Max output tokens', ignoreFocusOut: true },
  );
  if (!outPick) return;
  if (outPick.value === -1) {
    const custom = await vscode.window.showInputBox({
      prompt: 'Enter custom max output tokens',
      placeHolder: '16384',
      validateInput: v => /^\d+$/.test(v || '') ? undefined : 'Must be a number',
      ignoreFocusOut: true,
    });
    if (!custom) return;
    form.maxOut = parseInt(custom, 10);
  } else {
    form.maxOut = outPick.value;
  }

  // Step 6 — Vision support
  const visionPick = await vscode.window.showQuickPick(
    [{ label: 'Yes — model supports images', value: true },
     { label: 'No — text only', value: false }],
    { placeHolder: '6/8 — Does the model support images/vision?', ignoreFocusOut: true },
  );
  if (visionPick === undefined) return;
  form.image = visionPick.value;

  // Step 7 — Thinking/reasoning support
  const thinkingPick = await vscode.window.showQuickPick(
    [{ label: 'Yes — model emits reasoning tokens', value: true },
     { label: 'No', value: false }],
    { placeHolder: '7/8 — Does the model support thinking/reasoning?', ignoreFocusOut: true },
  );
  if (thinkingPick === undefined) return;
  form.thinking = thinkingPick.value;

  // Step 8 — Tool calling limit
  const toolPick = await vscode.window.showQuickPick(
    TOOL_SIZES,
    { placeHolder: '8/8 — Max parallel tool calls', ignoreFocusOut: true },
  );
  if (toolPick === undefined) return;
  form.toolCalling = toolPick.value;

  // Construct the model entry
  const entry: Record<string, unknown> = {
    id: form.id,
    family: form.family,
    name: form.name,
    detail: form.name !== form.id ? form.name : 'User-defined model',
    maxIn: form.maxIn,
    maxOut: form.maxOut,
    image: form.image,
    thinking: form.thinking,
    toolCalling: form.toolCalling,
  };

  // Models are a map of provider UUID -> models, which is what model-catalog
  // reads. This wrote a flat array, and loadUserModels drops anything that is
  // an array outright — so every model added here was invisible.
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
  const raw = config.get<unknown>('models');
  const map: Record<string, any[]> = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? { ...(raw as Record<string, any[]>) }
    : {};
  const arr = Array.isArray(map[parentUuid]) ? [...map[parentUuid]] : [];
  const idx = arr.findIndex((m: any) => m?.id === form.id);
  if (idx >= 0) arr[idx] = { ...arr[idx], ...entry };
  else arr.push(entry);
  map[parentUuid] = arr;
  await config.update('models', map, vscode.ConfigurationTarget.Global);

  ctx.bridge.signal();
  vscode.window.showInformationMessage(
    `Model "${form.name}" (${form.id}) added. Open Copilot Chat to select it.`
  );
}

// ---- Remove Model — pick from user model list ----

async function _removeModel(ctx: Context): Promise<void> {
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
  // Same map shape _addModel now writes: provider UUID -> that provider's models.
  const raw = config.get<unknown>('models');
  const map: Record<string, any[]> = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? { ...(raw as Record<string, any[]>) }
    : {};

  const providers = ctx.tuning.providers;
  const rows = Object.entries(map).flatMap(([parentUuid, arr]) =>
    (Array.isArray(arr) ? arr : [])
      .filter(m => m && typeof m.id === 'string' && !m._deleted)
      .map(m => ({
        label: m.name || m.id,
        description: m.id,
        detail: providers[parentUuid]?.name || providers[parentUuid]?.family || parentUuid,
        value: m.id,
        parentUuid,
      })));

  if (rows.length === 0) {
    vscode.window.showInformationMessage('No custom models to remove.');
    return;
  }

  const pick = await vscode.window.showQuickPick(rows,
    { placeHolder: 'Select a model to remove', ignoreFocusOut: true });
  if (!pick) return;

  map[pick.parentUuid] = (map[pick.parentUuid] ?? []).filter((m: any) => m?.id !== pick.value);
  await config.update('models', map, vscode.ConfigurationTarget.Global);
  ctx.bridge.signal();
  vscode.window.showInformationMessage(`Removed "${pick.label}".`);
}

// ---- Add Provider — step‑by‑step form (no JSON editing) ----

async function _addProvider(ctx: Context): Promise<void> {
  // Step 1 — Family, from the engines that actually exist. It used to be a free
  // text box, which let a provider be filed under a family no engine answers to.
  const pick = await vscode.window.showQuickPick(
    KNOWN_FAMILIES.map(f => ({ label: f.label, description: f.family, detail: f.desc, value: f.family })),
    { placeHolder: '1/3 — Provider family', ignoreFocusOut: true, matchOnDetail: true },
  );
  if (!pick) return;
  const fam = pick.value;

  // Step 2 — Base URL
  const baseUrl = await vscode.window.showInputBox({
    prompt: `2/3 — API base URL for ${pick.label}`,
    value: defaultUrlFor(fam),
    placeHolder: 'https://api.example.com/v1',
    ignoreFocusOut: true,
    validateInput: v => v?.trim() ? undefined : 'Base URL is required',
  });
  if (!baseUrl) return;

  // Step 3 — Model aliases (optional, comma-separated key=value pairs)
  const aliasesRaw = await vscode.window.showInputBox({
    prompt: `3/3 — Model aliases for ${pick.label} (optional). Format: pickerId=apiName`,
    placeHolder: 'gpt-4o=gpt-4o-2024-08-06, my-model=real-model-name',
    ignoreFocusOut: true,
  });

  const modelAlias: Record<string, string> = {};
  if (aliasesRaw?.trim()) {
    for (const pair of aliasesRaw.split(',')) {
      const [k, ...v] = pair.trim().split('=');
      if (k && v.length) modelAlias[k.trim()] = v.join('=').trim();
    }
  }

  // Providers are keyed by UUID and carry their family as a field. This command
  // used to key them by the family name and omit the field entirely, so nothing
  // that resolves a provider by family could ever find one it had written.
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
  const providers = { ...(config.get<Record<string, any>>('providers') || {}) };
  const uuid = _uuid();
  providers[uuid] = {
    uuid,
    family: fam,
    name: pick.label,
    baseUrl: baseUrl.trim(),
    modelAlias,
  };
  await config.update('providers', providers, vscode.ConfigurationTarget.Global);

  ctx.bridge.signal();
  const next = await vscode.window.showInformationMessage(
    `Provider "${pick.label}" added (${baseUrl.trim()}).`,
    'Set API key', 'Open Settings',
  );
  if (next === 'Set API key') await vscode.commands.executeCommand('copilot-adapter-kit.setApiKey');
  if (next === 'Open Settings') await vscode.commands.executeCommand('copilot-adapter-kit.openPanel');
}

/** Same id shape the settings panel uses, so both write interchangeable rows. */
function _uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}


// ---- Remove Provider — pick from provider list ----

async function _removeProvider(ctx: Context): Promise<void> {
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
  const providers = { ...(config.get<Record<string, any>>('providers') || {}) };

  // Anything unreadable is skipped rather than dereferenced: this is user-edited
  // JSON, and a half-written entry used to take the whole command down.
  const entries = Object.entries(providers)
    .filter(([, v]) => v && typeof v === 'object' && !v._deleted);
  if (!entries.length) {
    vscode.window.showInformationMessage('No providers configured.');
    return;
  }

  const pick = await vscode.window.showQuickPick(
    // Keyed by UUID, so the key itself is not a name anyone recognises.
    entries.map(([k, v]) => ({
      label: v.name || v.family || k,
      description: v.family ?? '',
      detail: v.baseUrl || 'no base URL set',
      value: k,
    })),
    { placeHolder: 'Select a provider to remove', ignoreFocusOut: true },
  );
  if (!pick) return;

  const confirm = await vscode.window.showWarningMessage(
    `Remove "${pick.label}"? Its models stop appearing in the picker.`,
    { modal: true }, 'Remove',
  );
  if (confirm !== 'Remove') return;

  delete providers[pick.value];
  await config.update('providers', providers, vscode.ConfigurationTarget.Global);
  ctx.bridge.signal();
  vscode.window.showInformationMessage(`Removed provider "${pick.label}".`);
}

// ---- Configure — master wizard for all simple settings ----

async function _configure(ctx: Context): Promise<void> {
  // Category picker
  const category = await vscode.window.showQuickPick(
    [
      { label: '$(settings-gear)  Max Output Tokens',    desc: 'Limit tokens per request',   id: 'maxTokens' },
      { label: '$(shield)  Spend Guard',          desc: 'Daily budget & loop limits',  id: 'budget' },
      { label: '$(list-unordered)  Log Level',            desc: 'quiet / meta / dump',         id: 'logLevel' },
      { label: '$(tools)  Stabilize Tools',      desc: 'Lock tool config for caching',id: 'stabilizeTools' },
      { label: '$(eye)  Show Built‑in Models', desc: 'Toggle built‑in model list',  id: 'showBuiltinModels' },
    ],
    { placeHolder: 'Select a setting to change', ignoreFocusOut: true },
  );
  if (!category) return;
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');

  if (category.id === 'budget') { await _showUsage(ctx); return; }

  switch (category.id) {
    case 'maxTokens': {
      const v = await vscode.window.showInputBox({
        prompt: 'Max output tokens per request (0 = use the model maximum)',
        placeHolder: '0',
        value: String(config.get<number>('maxTokens', 0)),
        validateInput: x => /^\d+$/.test(x || '') ? undefined : 'Must be a number',
        ignoreFocusOut: true,
      });
      if (v !== undefined) {
        await config.update('maxTokens', parseInt(v, 10) || 0, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Max output tokens set to ${parseInt(v, 10) || 'the model maximum'}.`);
      }
      break;
    }
    case 'logLevel': {
      const v = await vscode.window.showQuickPick(
        [
          { label: '$(mute) quiet', desc: 'No output channel', value: 'quiet' },
          { label: '$(list-unordered) meta',  desc: 'Log request fingerprints & diffs', value: 'meta' },
          { label: '$(save) dump',  desc: 'meta + write request payloads to disk', value: 'dump' },
        ],
        { placeHolder: 'Select log level', ignoreFocusOut: true },
      );
      if (v) {
        await config.update('logLevel', v.value, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Log level set to "${v.value}".`);
      }
      break;
    }
    case 'stabilizeTools': {
      const v = await vscode.window.showQuickPick(
        [
          { label: '$(check) Enabled',  desc: 'Pre-activate tools for cache stability', value: true },
          { label: '$(circle-slash) Disabled', desc: 'Default — tools may shift between turns', value: false },
        ],
        { placeHolder: 'Enable tool stabilization?', ignoreFocusOut: true },
      );
      if (v !== undefined) {
        await config.update('stabilizeTools', v.value, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Stabilize tools: ${v.value ? 'ON' : 'OFF'}.`);
      }
      break;
    }
    case 'showBuiltinModels': {
      const v = await vscode.window.showQuickPick(
        [
          { label: '$(eye)  Show', desc: 'Built‑in GPT + Codex models visible in picker', value: true },
          { label: '$(eye-closed) Hide',  desc: 'Only your custom models appear in picker', value: false },
        ],
        { placeHolder: 'Show built‑in models in picker?', ignoreFocusOut: true },
      );
      if (v !== undefined) {
        await config.update('showBuiltinModels', v.value, vscode.ConfigurationTarget.Global);
        ctx.bridge.signal();
        vscode.window.showInformationMessage(`Built‑in models: ${v.value ? 'SHOWN' : 'HIDDEN'}.`);
      }
      break;
    }
  }
}

async function _generateCommitMessage(ext: vscode.ExtensionContext, ctx: Context): Promise<void> {
  // Open the panel — user uses the Tools tab to generate commit messages
  SettingsPanel.show(ext, ctx);
}

// ---- Spend guard: status bar, usage report, override ----

async function _showUsage(ctx: Context): Promise<void> {
  const s = ctx.budget.status();
  const used = s.day.inputTokens + s.day.outputTokens;

  const lines = [
    `Tokens today:   ${fmtTokens(used)}` +
      (s.caps.dailyTokenLimit > 0
        ? ` of ${fmtTokens(s.caps.dailyTokenLimit)} (${Math.round(s.tokenPct)}%)`
        : '  (no limit set)'),
    `  input:        ${fmtTokens(s.day.inputTokens)}`,
    `  output:       ${fmtTokens(s.day.outputTokens)}`,
    `Estimated cost: $${s.day.costUsd.toFixed(2)}` +
      (s.caps.dailyCostLimitUsd > 0 ? ` of $${s.caps.dailyCostLimitUsd.toFixed(2)}` : '  (no limit set)'),
    `Requests:       ${s.day.requests} sent, ${s.day.blocked} blocked`,
    '',
  ];

  const models = Object.entries(s.day.byModel)
    .sort((a, b) => (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens))
    .slice(0, 8);
  if (models.length) {
    lines.push('By model:');
    for (const [id, m] of models) {
      lines.push(`  ${id} — ${fmtTokens(m.inputTokens + m.outputTokens)} tok` +
        (m.costUsd > 0 ? `, $${m.costUsd.toFixed(2)}` : '') + `, ${m.requests} req`);
    }
    lines.push('');
  }

  if (s.day.estimated) {
    lines.push('Note: some figures are estimates — that provider reported no usage data.');
  }
  lines.push(s.caps.enforce
    ? `Spend guard: ON — per-request input ≤ ${fmtTokens(s.caps.maxInputTokensPerRequest)}, ` +
      `≤ ${s.caps.maxTurnsPerConversation} turns per conversation, output capped per model.`
    : 'Spend guard: OFF — nothing is capped.');

  const actions = s.caps.enforce
    ? ['Open Spend Guard', 'Reset Usage', 'Disable Guard']
    : ['Enable Guard', 'Open Spend Guard'];

  const choice = await vscode.window.showInformationMessage(
    `Copilot Adapter Kit — usage for ${s.day.day}`,
    { modal: true, detail: lines.join('\n') },
    ...actions,
  );
  if (choice === 'Open Spend Guard') {
    await vscode.commands.executeCommand('copilot-adapter-kit.showUsage');
  } else if (choice === 'Reset Usage') {
    await _resetBudget(ctx);
  } else if (choice === 'Disable Guard') {
    await _setSpendGuard(ctx, false);
  } else if (choice === 'Enable Guard') {
    await _setSpendGuard(ctx, true);
  }
}

async function _resetBudget(ctx: Context): Promise<void> {
  const ok = await vscode.window.showWarningMessage(
    'Reset the recorded usage for today to zero?',
    { modal: true, detail: 'This clears the local counters only. Your provider has still billed what was already spent.' },
    'Reset',
  );
  if (ok !== 'Reset') return;
  await ctx.budget.reset();
  vscode.window.showInformationMessage('Usage counters reset for today.');
}

async function _setSpendGuard(ctx: Context, on: boolean): Promise<void> {
  if (on) {
    await ctx.budget.setEnforcement(true);
    vscode.window.showInformationMessage('Spend guard re-enabled. Daily limits are in force again.');
    return;
  }

  const caps = ctx.budget.caps;
  const detail = [
    'Every spend protection will be removed:',
    '',
    `  • daily limit of ${fmtTokens(caps.dailyTokenLimit)} tokens / $${caps.dailyCostLimitUsd.toFixed(2)} — REMOVED`,
    `  • per-request input ceiling of ${fmtTokens(caps.maxInputTokensPerRequest)} tokens — REMOVED`,
    `  • agent loop guard at ${caps.maxTurnsPerConversation} turns per conversation — REMOVED`,
    '',
    'A runaway agent loop can then consume tens of millions of tokens unattended,',
    'and your provider will bill you for all of it.',
    '',
    'The status bar stays red for as long as protection is off.',
  ].join('\n');

  const first = await vscode.window.showWarningMessage(
    'DANGER — disable the spend guard?',
    { modal: true, detail },
    'I accept unlimited charges',
  );
  if (first !== 'I accept unlimited charges') return;

  const typed = await vscode.window.showInputBox({
    prompt: 'Type DISABLE to confirm removing all spend protection',
    placeHolder: 'DISABLE',
    ignoreFocusOut: true,
    validateInput: v => (!v || v === 'DISABLE') ? undefined : 'Type DISABLE exactly, or press Escape to cancel',
  });
  if (typed !== 'DISABLE') return;

  await ctx.budget.setEnforcement(false);
  void vscode.window.showWarningMessage(
    'Spend guard DISABLED. Requests are now uncapped — re-enable it as soon as you are done.',
    'Re-enable now',
  ).then(c => { if (c === 'Re-enable now') void _setSpendGuard(ctx, true); });
}

// ---- Phase 1: webview pipeline ----

/** Opens the parity harness so the built stylesheet can be checked against the mock. */
function _openHarness(ext: vscode.ExtensionContext): void {
  const host = new WebviewHost(ext);
  const panel = vscode.window.createWebviewPanel(
    'cak.harness',
    'CAK — UI Parity Harness',
    vscode.ViewColumn.Active,
    host.options,
  );
  try {
    panel.webview.html = host.html(panel.webview, 'harness');
  } catch (e) {
    panel.dispose();
    void vscode.window.showErrorMessage((e as Error).message);
  }
}
