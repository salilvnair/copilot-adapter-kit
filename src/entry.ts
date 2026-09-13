// entry.ts — SpringApplication.run()
import vscode from 'vscode';
import { fmtTokens, type BudgetStatus } from './kernel/budget';
import { Context } from './kernel/context';
import { MiniGitPanel } from './panel/MiniGitPanel';
import { SettingsPanel } from './panel/SettingsPanel';
import { SpendGuardPanel } from './panel/SpendGuardPanel';
import { WebviewHost } from './panel/webview-host';

let instance: Context | undefined;

export async function activate(ext: vscode.ExtensionContext): Promise<void> {
  const ctx = await Context.bootstrap(ext);
  instance = ctx;

  // Status bar entry — live spend readout, click to open usage
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'copilot-adapter-kit.showUsage';
  const paint = (s: BudgetStatus) => _paintStatus(status, s);
  paint(ctx.budget.status());
  status.show();
  ext.subscriptions.push(status, ctx.budget.onChange(paint));

  ext.subscriptions.push(
    vscode.commands.registerCommand('copilot-adapter-kit.openPanel',     () => SettingsPanel.show(ext, ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.setApiKey',     () => _promptKey(ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.clearApiKey',   () => _clearKey(ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.addModel',      () => _addModel(ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.removeModel',   () => _removeModel(ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.addProvider',   () => _addProvider(ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.removeProvider',() => _removeProvider(ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.configure',     () => _configure(ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.openSettings',  () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:salilvnair.copilot-adapter-kit')),
    vscode.commands.registerCommand('copilot-adapter-kit.showLogs',      () =>
      (vscode.window as any).showOutputChannel?.() || ctx.tracer.info('')),
    vscode.commands.registerCommand('copilot-adapter-kit.openDumps',     () => ctx.tracer.openDumpsFolder()),
    vscode.commands.registerCommand('copilot-adapter-kit.generateCommitMessage', () => _generateCommitMessage(ext, ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.showUsage',          () => SpendGuardPanel.show(ext, ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.resetBudget',        () => _resetBudget(ctx)),
    vscode.commands.registerCommand('copilot-adapter-kit.disableSpendGuard',  () => _setSpendGuard(ctx, false)),
    vscode.commands.registerCommand('copilot-adapter-kit.enableSpendGuard',   () => _setSpendGuard(ctx, true)),
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
      '⚠️ Copilot Adapter Kit: the spend guard is OFF. Requests are uncapped and can run up unlimited provider charges.',
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
  { label: '400K', value: 400000 },
  { label: '1M',   value: 1000000 },
];

const OUTPUT_SIZES = [
  { label: '4K',   value: 4096 },
  { label: '8K',   value: 8192 },
  { label: '16K',  value: 16384 },
  { label: '32K',  value: 32768 },
  { label: '64K',  value: 65536 },
  { label: '128K', value: 128000 },
];

const TOOL_SIZES = [
  { label: 'None',  value: 0 },
  { label: '16',    value: 16 },
  { label: '32',    value: 32 },
  { label: '64',    value: 64 },
  { label: '128',   value: 128 },
];

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

  // Step 2 — Provider family
  const families = ctx.discovery.families();
  const family = families.length === 1
    ? families[0]
    : await vscode.window.showQuickPick(families.map(f => ({ label: f, value: f })), {
        placeHolder: '2/8 — Select provider family',
        ignoreFocusOut: true,
      });
  if (!family) return;
  form.family = typeof family === 'string' ? family : family.value;
  // If user typed custom family, use it
  if (typeof family !== 'string' && family.label !== family.value) {
    form.family = family.value;
  }

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

  // Write into settings
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
  const existing = config.get<unknown[]>('models') || [];
  // Replace if same id+family exists, otherwise append
  const idx = existing.findIndex((m: any) => m?.id === form.id && m?.family === form.family);
  if (idx >= 0) { existing[idx] = entry; }
  else { existing.push(entry); }
  await config.update('models', existing, vscode.ConfigurationTarget.Global);

  ctx.bridge.signal();
  vscode.window.showInformationMessage(
    `✅ Model "${form.name}" (${form.id}) added to ${form.family}. ` +
    'Open Copilot Chat to select it.'
  );
}

// ---- Remove Model — pick from user model list ----

async function _removeModel(ctx: Context): Promise<void> {
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
  const existing = (config.get<unknown[]>('models') || []) as Array<{ id: string; name: string; family: string }>;
  if (!existing.length) {
    vscode.window.showInformationMessage('No custom models to remove. Built‑in models cannot be removed.');
    return;
  }

  const pick = await vscode.window.showQuickPick(
    existing.map(m => ({ label: `${m.name || m.id} (${m.family})`, value: m.id, family: m.family })),
    { placeHolder: 'Select a model to remove', ignoreFocusOut: true },
  );
  if (!pick) return;

  const updated = existing.filter(m => !(m.id === pick.value && m.family === pick.family));
  await config.update('models', updated, vscode.ConfigurationTarget.Global);
  ctx.bridge.signal();
  vscode.window.showInformationMessage(`🗑️ Removed "${pick.label}".`);
}

// ---- Add Provider — step‑by‑step form (no JSON editing) ----

async function _addProvider(ctx: Context): Promise<void> {
  // Step 1 — Family name
  const family = await vscode.window.showInputBox({
    prompt: '1/3 — Provider family name (e.g. openai, ollama, groq)',
    placeHolder: 'my-provider',
    ignoreFocusOut: true,
    validateInput: v => v?.trim() ? undefined : 'Family name is required',
  });
  if (!family) return;
  const fam = family.trim();

  // Step 2 — Base URL
  const baseUrl = await vscode.window.showInputBox({
    prompt: `2/3 — API base URL for ${fam}`,
    placeHolder: 'https://api.example.com/v1',
    ignoreFocusOut: true,
    validateInput: v => v?.trim() ? undefined : 'Base URL is required',
  });
  if (!baseUrl) return;

  // Step 3 — Model aliases (optional, comma-separated key=value pairs)
  const aliasesRaw = await vscode.window.showInputBox({
    prompt: `3/3 — Model aliases for ${fam} (optional). Format: pickerId=apiName, pickerId2=apiName2`,
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

  // Write into settings
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
  const providers = config.get<Record<string, unknown>>('providers') || {};
  providers[fam] = { baseUrl: baseUrl.trim(), modelAlias };
  await config.update('providers', providers, vscode.ConfigurationTarget.Global);

  ctx.bridge.signal();
  vscode.window.showInformationMessage(
    `✅ Provider "${fam}" added (${baseUrl.trim()}). ` +
    `Set its API key with "Copilot Adapter Kit: Set API Key".`
  );
}

// ---- Remove Provider — pick from provider list ----

async function _removeProvider(ctx: Context): Promise<void> {
  const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
  const providers = config.get<Record<string, { baseUrl: string }>>('providers') || {};
  const entries = Object.entries(providers);
  if (!entries.length) {
    vscode.window.showInformationMessage('No providers configured.');
    return;
  }

  const pick = await vscode.window.showQuickPick(
    entries.map(([k, v]) => ({ label: `${k} — ${v.baseUrl}`, value: k })),
    { placeHolder: 'Select a provider to remove', ignoreFocusOut: true },
  );
  if (!pick) return;

  delete providers[pick.value];
  await config.update('providers', providers, vscode.ConfigurationTarget.Global);
  ctx.bridge.signal();
  vscode.window.showInformationMessage(`🗑️ Removed provider "${pick.value}".`);
}

// ---- Configure — master wizard for all simple settings ----

async function _configure(ctx: Context): Promise<void> {
  // Category picker
  const category = await vscode.window.showQuickPick(
    [
      { label: '⚙️  Max Output Tokens',    desc: 'Limit tokens per request',   id: 'maxTokens' },
      { label: '🛡️  Spend Guard',          desc: 'Daily budget & loop limits',  id: 'budget' },
      { label: '📋  Log Level',            desc: 'quiet / meta / dump',         id: 'logLevel' },
      { label: '🔧  Stabilize Tools',      desc: 'Lock tool config for caching',id: 'stabilizeTools' },
      { label: '👁️  Show Built‑in Models', desc: 'Toggle built‑in model list',  id: 'showBuiltinModels' },
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
        vscode.window.showInformationMessage(`✅ Max output tokens set to ${parseInt(v, 10) || 'the model maximum'}.`);
      }
      break;
    }
    case 'logLevel': {
      const v = await vscode.window.showQuickPick(
        [
          { label: '🔇 quiet', desc: 'No output channel', value: 'quiet' },
          { label: '📋 meta',  desc: 'Log request fingerprints & diffs', value: 'meta' },
          { label: '💾 dump',  desc: 'meta + write request payloads to disk', value: 'dump' },
        ],
        { placeHolder: 'Select log level', ignoreFocusOut: true },
      );
      if (v) {
        await config.update('logLevel', v.value, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`✅ Log level set to "${v.value}".`);
      }
      break;
    }
    case 'stabilizeTools': {
      const v = await vscode.window.showQuickPick(
        [
          { label: '✅ Enabled',  desc: 'Pre-activate tools for cache stability', value: true },
          { label: '❌ Disabled', desc: 'Default — tools may shift between turns', value: false },
        ],
        { placeHolder: 'Enable tool stabilization?', ignoreFocusOut: true },
      );
      if (v !== undefined) {
        await config.update('stabilizeTools', v.value, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`✅ Stabilize tools: ${v.value ? 'ON' : 'OFF'}.`);
      }
      break;
    }
    case 'showBuiltinModels': {
      const v = await vscode.window.showQuickPick(
        [
          { label: '👁️  Show', desc: 'Built‑in GPT + Codex models visible in picker', value: true },
          { label: '🙈 Hide',  desc: 'Only your custom models appear in picker', value: false },
        ],
        { placeHolder: 'Show built‑in models in picker?', ignoreFocusOut: true },
      );
      if (v !== undefined) {
        await config.update('showBuiltinModels', v.value, vscode.ConfigurationTarget.Global);
        ctx.bridge.signal();
        vscode.window.showInformationMessage(`✅ Built‑in models: ${v.value ? 'SHOWN' : 'HIDDEN'}.`);
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

function _paintStatus(item: vscode.StatusBarItem, s: BudgetStatus): void {
  const used = s.day.inputTokens + s.day.outputTokens;
  const cost = s.day.costUsd > 0 ? ` · $${s.day.costUsd.toFixed(2)}` : '';

  if (!s.caps.enforce) {
    // Loud and permanent: no cap is in force.
    item.text = `$(cak-icon) $(alert) UNCAPPED ${fmtTokens(used)}${cost}`;
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    item.tooltip = _tooltip(s, 'SPEND GUARD OFF — requests are unlimited. Click for details.');
    return;
  }

  item.text = `$(cak-icon) ${fmtTokens(used)}${cost}`;
  item.backgroundColor = s.overLimit
    ? new vscode.ThemeColor('statusBarItem.errorBackground')
    : s.nearLimit
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  item.tooltip = _tooltip(s, s.overLimit
    ? 'Daily budget reached — further requests are blocked.'
    : 'Copilot Adapter Kit — usage today. Click for details.');
}

function _tooltip(s: BudgetStatus, head: string): vscode.MarkdownString {
  const used = s.day.inputTokens + s.day.outputTokens;
  const tokens = s.caps.dailyTokenLimit > 0
    ? `${fmtTokens(used)} / ${fmtTokens(s.caps.dailyTokenLimit)} (${Math.round(s.tokenPct)}%)`
    : `${fmtTokens(used)} (no limit)`;
  const cost = s.caps.dailyCostLimitUsd > 0
    ? `$${s.day.costUsd.toFixed(2)} / $${s.caps.dailyCostLimitUsd.toFixed(2)}`
    : `$${s.day.costUsd.toFixed(2)} (no limit)`;

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${head}**\n\n`);
  md.appendMarkdown(`Today (${s.day.day})\n\n`);
  md.appendMarkdown(`- Tokens: ${tokens}\n`);
  md.appendMarkdown(`- Cost: ${cost}\n`);
  md.appendMarkdown(`- Requests: ${s.day.requests}${s.day.blocked ? ` · ${s.day.blocked} blocked` : ''}\n`);
  if (s.day.estimated) {
    md.appendMarkdown('\n_Some figures are estimates — that provider reported no usage data._\n');
  }
  return md;
}

/** Kept for the notification's View Usage action, which cannot open a panel. */
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
  vscode.window.showInformationMessage('✅ Usage counters reset for today.');
}

async function _setSpendGuard(ctx: Context, on: boolean): Promise<void> {
  if (on) {
    await ctx.budget.setEnforcement(true);
    vscode.window.showInformationMessage('🛡️ Spend guard re-enabled. Daily limits are in force again.');
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
    '⚠️ DANGER — disable the spend guard?',
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
    '🔴 Spend guard DISABLED. Requests are now uncapped — re-enable it as soon as you are done.',
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
