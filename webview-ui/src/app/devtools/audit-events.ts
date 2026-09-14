/**
 * Configurable audit event framework.
 * Each event type has: module, button, action — enable/disable individually.
 * Config persists to localStorage.
 *
 * Ported from daakia's ui-audit-store. The taxonomy is this extension's own —
 * there are no protocols here, there are providers, models, keys and a budget —
 * but the shape, the storage and the semantics are the same, so the screen that
 * configures it is the same screen.
 */

import { post } from '../../vscode';

export interface AuditEventDef {
  id: string;
  module: string;
  button: string;
  action: string;
  description: string;
  color: string;
  defaultEnabled: boolean;
}

/* Colours per module. Anything that spends money or destroys data is warm; the
   rest take the panel's own palette, so a scan down the list groups by weight
   before you read a word of it. */
const C = {
  providers: 'var(--color-primary)',
  models: '#818cf8',
  keys: '#f59e0b',
  guard: 'var(--color-success)',
  workspace: 'var(--color-info)',
  git: '#a78bfa',
  audit: '#06b6d4',
  devtools: 'var(--color-settings)',
  danger: 'var(--color-error)',
  status: 'var(--color-text-secondary)',
};

export const AUDIT_EVENT_DEFS: AuditEventDef[] = [
  // ── Providers ──────────────────────────────────────────────────────────────
  { id: 'provider.add',        module: 'Providers', button: 'Add provider',   action: 'create', description: 'Add a provider',                              color: C.providers, defaultEnabled: true },
  { id: 'provider.save',       module: 'Providers', button: 'Save provider',  action: 'update', description: 'Save changes to a provider',                  color: C.providers, defaultEnabled: true },
  { id: 'provider.remove',     module: 'Providers', button: 'Remove',         action: 'delete', description: 'Move a provider to the Bin',                  color: C.providers, defaultEnabled: true },
  { id: 'provider.duplicate',  module: 'Providers', button: 'Duplicate',      action: 'create', description: 'Copy a provider and its models',              color: C.providers, defaultEnabled: false },
  { id: 'provider.test',       module: 'Providers', button: 'Test',           action: 'read',   description: 'Probe a provider for reachability',           color: C.providers, defaultEnabled: false },
  { id: 'provider.test_all',   module: 'Providers', button: 'Test all',       action: 'read',   description: 'Probe every provider at once',                color: C.providers, defaultEnabled: false },

  // ── Models ─────────────────────────────────────────────────────────────────
  { id: 'model.save',          module: 'Models', button: 'Save model',        action: 'update', description: 'Add or edit a model',                         color: C.models, defaultEnabled: true },
  { id: 'model.remove',        module: 'Models', button: 'Remove',            action: 'delete', description: 'Move a model to the Bin',                     color: C.models, defaultEnabled: true },
  { id: 'model.toggle',        module: 'Models', button: 'Picker switch',     action: 'update', description: 'Show or hide a model in the Copilot picker',  color: C.models, defaultEnabled: false },
  { id: 'model.api_path',      module: 'Models', button: 'API path',          action: 'update', description: 'Override the endpoint path for one model',    color: C.models, defaultEnabled: false },

  // ── API Keys ───────────────────────────────────────────────────────────────
  // The key itself is never recorded — only that one was set, and for which
  // provider. Nothing in this module may carry a value.
  { id: 'key.set',             module: 'API Keys', button: 'Save key',        action: 'create', description: 'Store a key in the OS keychain',              color: C.keys, defaultEnabled: true },
  { id: 'key.replace',         module: 'API Keys', button: 'Replace key',     action: 'update', description: 'Replace a stored key',                        color: C.keys, defaultEnabled: true },
  { id: 'key.clear',           module: 'API Keys', button: 'Remove key',      action: 'delete', description: 'Delete a key from the keychain',              color: C.keys, defaultEnabled: true },
  { id: 'key.clear_all',       module: 'API Keys', button: 'Clear all keys',  action: 'delete', description: 'Delete every stored key',                     color: C.keys, defaultEnabled: true },

  // ── Spend Guard ────────────────────────────────────────────────────────────
  { id: 'guard.limit',         module: 'Spend Guard', button: 'Limit stepper', action: 'update', description: 'Change a daily or per-request limit',        color: C.guard, defaultEnabled: true },
  { id: 'guard.disable',       module: 'Spend Guard', button: 'Disable guard', action: 'update', description: 'Turn spend protection off',                  color: C.guard, defaultEnabled: true },
  { id: 'guard.enable',        module: 'Spend Guard', button: 'Enable guard',  action: 'update', description: 'Turn spend protection back on',              color: C.guard, defaultEnabled: true },
  { id: 'guard.reset',         module: 'Spend Guard', button: 'Reset counters',action: 'delete', description: 'Zero today’s usage figures',            color: C.guard, defaultEnabled: true },

  // ── Workspace ──────────────────────────────────────────────────────────────
  { id: 'config.save',         module: 'Workspace', button: 'Setting',        action: 'update', description: 'Change a configuration value',                color: C.workspace, defaultEnabled: false },
  { id: 'config.prompt',       module: 'Workspace', button: 'Prompt template',action: 'update', description: 'Edit a system or user prompt template',       color: C.workspace, defaultEnabled: true },
  { id: 'config.vision',       module: 'Workspace', button: 'Vision fallback',action: 'update', description: 'Change the vision fallback route',            color: C.workspace, defaultEnabled: true },
  { id: 'config.open_json',    module: 'Workspace', button: 'settings.json',  action: 'read',   description: 'Open the raw settings file',                  color: C.workspace, defaultEnabled: false },
  { id: 'config.open_dumps',   module: 'Workspace', button: 'Request Dumps',  action: 'read',   description: 'Open the request dump folder',                color: C.workspace, defaultEnabled: false },

  // ── Git Tools ──────────────────────────────────────────────────────────────
  { id: 'git.generate',        module: 'Git Tools', button: 'Generate',       action: 'create', description: 'Write a commit message with a model',         color: C.git, defaultEnabled: true },
  { id: 'git.prompt',          module: 'Git Tools', button: 'Git prompt',     action: 'update', description: 'Edit the commit message prompt',              color: C.git, defaultEnabled: false },
  { id: 'git.scope',           module: 'Git Tools', button: 'Scope',          action: 'update', description: 'Switch between staged and all files',         color: C.git, defaultEnabled: false },

  // ── Audit ──────────────────────────────────────────────────────────────────
  { id: 'audit.reload',        module: 'Audit', button: 'Reload',             action: 'read',   description: 'Reload the audit log',                        color: C.audit, defaultEnabled: false },
  { id: 'audit.export',        module: 'Audit', button: 'Export',             action: 'read',   description: 'Export the audit log as JSON',                color: C.audit, defaultEnabled: true },
  { id: 'audit.clear',         module: 'Audit', button: 'Clear',              action: 'delete', description: 'Erase every audit entry',                     color: C.audit, defaultEnabled: true },
  { id: 'audit.record_bodies', module: 'Audit', button: 'Record bodies',      action: 'update', description: 'Start or stop recording prompts and responses', color: C.audit, defaultEnabled: true },

  // ── Dev Tools ──────────────────────────────────────────────────────────────
  { id: 'devtools.audit_config', module: 'Dev Tools', button: 'Audit Config', action: 'update', description: 'Turn an audit event on or off',               color: C.devtools, defaultEnabled: false },
  { id: 'devtools.db_query',     module: 'Dev Tools', button: 'DB Explorer',  action: 'read',   description: 'Browse a database table',                     color: C.devtools, defaultEnabled: false },
  { id: 'devtools.db_delete',    module: 'Dev Tools', button: 'Delete row',   action: 'delete', description: 'Delete a row from the database',              color: C.devtools, defaultEnabled: true },

  // ── Danger Zone ────────────────────────────────────────────────────────────
  { id: 'danger.delete_all',   module: 'Danger Zone', button: 'Delete all providers', action: 'delete', description: 'Remove every provider',               color: C.danger, defaultEnabled: true },
  { id: 'danger.reset',        module: 'Danger Zone', button: 'Reset settings',       action: 'delete', description: 'Return every setting to its default', color: C.danger, defaultEnabled: true },
  { id: 'danger.factory',      module: 'Danger Zone', button: 'Factory reset',        action: 'delete', description: 'Erase everything this extension holds', color: C.danger, defaultEnabled: true },
  { id: 'danger.bin_clear',    module: 'Danger Zone', button: 'Empty the Bin',        action: 'delete', description: 'Permanently remove soft-deleted items', color: C.danger, defaultEnabled: true },

  // ── Status Bar ─────────────────────────────────────────────────────────────
  { id: 'statusbar.menu',      module: 'Status Bar', button: 'Status item',   action: 'click',  description: 'Open the status menu',                        color: C.status, defaultEnabled: false },
  { id: 'extension.activate',  module: 'Status Bar', button: 'Startup',       action: 'read',   description: 'The extension started',                       color: C.status, defaultEnabled: true },
];

// ─── Config (localStorage) ────────────────────────────────────────────────────

const CONFIG_KEY = 'cak_audit_config';

export function getAuditConfig(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function setAuditEventEnabled(eventTypeId: string, enabled: boolean): void {
  const config = getAuditConfig();
  config[eventTypeId] = enabled;
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* private window */ }
  _publish();
}

export function isAuditEventEnabled(eventTypeId: string): boolean {
  const config = getAuditConfig();
  if (eventTypeId in config) return config[eventTypeId];
  const def = AUDIT_EVENT_DEFS.find(d => d.id === eventTypeId);
  return def?.defaultEnabled ?? false;
}

export function resetAuditConfig(): void {
  try { localStorage.removeItem(CONFIG_KEY); } catch { /* private window */ }
  _publish();
}

/**
 * The host writes most of these rows, not the webview, so it needs the config
 * too — otherwise turning an event off here would silence the screen while the
 * database kept filling up.
 */
function _publish(): void {
  const enabled: Record<string, boolean> = {};
  for (const def of AUDIT_EVENT_DEFS) enabled[def.id] = isAuditEventEnabled(def.id);
  post('setAuditConfig', { enabled });
}

/** Send the current config on load, so the host starts in step with it. */
export function publishAuditConfig(): void { _publish(); }

// ─── Log helper ───────────────────────────────────────────────────────────────

export function logUiEvent(eventTypeId: string, metadata?: Record<string, unknown>): void {
  if (!isAuditEventEnabled(eventTypeId)) return;
  const def = AUDIT_EVENT_DEFS.find(d => d.id === eventTypeId);
  if (!def) return;
  post('logUiAudit', {
    event_type: eventTypeId,
    module: def.module,
    button: def.button,
    action: def.action,
    metadata,
  });
}
