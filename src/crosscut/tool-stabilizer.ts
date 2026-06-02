// ToolStabilizer — pre-activates VS Code tools to lock the tools array
// across conversation turns. Full audit trail with round tracking,
// stale-activation scrubbing, and configuration-shift alerts.
import { createHash } from 'crypto';
import vscode from 'vscode';

// ---- Constants (all renamed) ----

const ACTIVATOR_PREFIX = 'activate_';
const STABILIZER_CALL_ID_PFX = 'cak_stabilize_';
const MAX_STABILIZE_ROUNDS = 3;
const ACTIVATOR_NAME_HASH_LEN = 32;

// Configuration shift alert markers — injected into chat to warn about
// tool changes. Filtered out on subsequent requests so they don't leak
// to the model provider.
const CONFIG_SHIFT_START = '[cak-config-shift-start]';
const CONFIG_SHIFT_END   = '[cak-config-shift-end]';

// ---- Types (all renamed) ----

export interface ToolStabilizerResult {
  intercepted: boolean;
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  shiftAlert?: string;
}

export interface ActivatorAudit {
  roundsUsed: number;
  alreadyActivated: string[];
  pendingActivators: string[];
}

// ---- Public API ----

export function stabilizeToolFlow(
  enabled: boolean,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  tools: readonly vscode.LanguageModelChatTool[] | undefined,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
): ToolStabilizerResult {
  // Scrub old stabilizer artifacts AND old config-shift alerts from history
  const clean = _scrubActivations(_scrubConfigAlerts(messages));
  const wasScrubbed = clean !== messages;

  if (!enabled) {
    return { intercepted: false, messages: clean };
  }

  const audit = _auditActivators(messages, tools);
  const toolLimit = 128; // OpenAI-compatible max

  // Guard: too many tools
  if ((tools?.length ?? 0) > toolLimit) {
    throw new Error(
      `Too many tools enabled (${tools!.length}). ` +
      `Max ${toolLimit} supported. Disable unused tools in VS Code Configure Tools.`
    );
  }

  if (audit.pendingActivators.length > 0) {
    if (audit.roundsUsed >= MAX_STABILIZE_ROUNDS) {
      throw new Error(
        `Tool stabilization exhausted after ${MAX_STABILIZE_ROUNDS} rounds. ` +
        `Still pending: ${audit.pendingActivators.join(', ')}. ` +
        'Disable copilot-adapter-kit.stabilizeTools or reduce enabled tools.'
      );
    }

    const nextRound = audit.roundsUsed + 1;
    for (const name of audit.pendingActivators) {
      const callId = _makeStabilizerCallId(nextRound, name);
      progress.report(new vscode.LanguageModelToolCallPart(callId, name, {}));
    }

    return { intercepted: true, messages };
  }

  // All activators called. Generate config-shift alert if tools changed.
  const shiftAlert = wasScrubbed
    ? _buildConfigShiftAlert(audit)
    : undefined;

  // If regenerated shift alert, inject into stream
  if (shiftAlert) {
    progress.report(new vscode.LanguageModelTextPart(shiftAlert));
  }

  return {
    intercepted: false,
    messages: clean,
    shiftAlert,
  };
}

export function auditActivators(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  tools: readonly vscode.LanguageModelChatTool[] | undefined,
): ActivatorAudit {
  return _auditActivators(messages, tools);
}

// ---- Config Shift Alerts ----

function _buildConfigShiftAlert(audit: ActivatorAudit): string {
  const activeCount = audit.alreadyActivated.length + audit.pendingActivators.length;
  const msg = activeCount <= 64
    ? `Tool configuration is stable — ${activeCount} tools active. No shift detected.`
    : `⚠️ Tool list is unstable — ${activeCount} tools active across ${audit.roundsUsed} rounds. ` +
      `Cache hit rate may be affected. Consider disabling unused tools in VS Code Configure Tools.`;

  return [
    '',
    CONFIG_SHIFT_START,
    '',
    `> ${msg}`,
    '',
    CONFIG_SHIFT_END,
    '',
  ].join('\n');
}

// ---- Internals ----

function _auditActivators(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  tools: readonly vscode.LanguageModelChatTool[] | undefined,
): ActivatorAudit {
  const allActivators = (tools ?? [])
    .filter(t => t.name.startsWith(ACTIVATOR_PREFIX))
    .map(t => t.name);

  const calledSet = new Set<string>();
  let roundsUsed = 0;
  const humanIdx = _lastHumanMsgIndex(messages);

  for (let i = humanIdx + 1; i < messages.length; i++) {
    for (const part of messages[i].content) {
      const parsed = _parseStabilizerPart(part);
      if (!parsed) continue;
      roundsUsed = Math.max(roundsUsed, parsed.round);
      if (parsed.toolName?.startsWith(ACTIVATOR_PREFIX)) {
        calledSet.add(parsed.toolName);
      }
    }
  }

  return {
    roundsUsed,
    alreadyActivated: [...calledSet],
    pendingActivators: allActivators.filter(n => !calledSet.has(n)),
  };
}

function _scrubActivations(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): readonly vscode.LanguageModelChatRequestMessage[] {
  let changed = false;
  const out: vscode.LanguageModelChatRequestMessage[] = [];

  for (const msg of messages) {
    const hasStabilizer = msg.content.some(_isStabilizerPart);
    const filtered = msg.content.filter(
      p => !_isStabilizerPart(p) && !(hasStabilizer && _isEmptyText(p))
    );
    if (filtered.length === msg.content.length) { out.push(msg); continue; }
    changed = true;
    if (filtered.length > 0) out.push({ ...msg, content: filtered });
  }
  return changed ? out : messages;
}

/** Remove config-shift alert blocks from message history so they don't leak. */
function _scrubConfigAlerts(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): readonly vscode.LanguageModelChatRequestMessage[] {
  let changed = false;
  const out: vscode.LanguageModelChatRequestMessage[] = [];

  for (const msg of messages) {
    if (msg.role !== vscode.LanguageModelChatMessageRole.Assistant) {
      out.push(msg); continue;
    }

    let msgChanged = false;
    const filtered: any[] = [];
    for (const part of msg.content) {
      if (!(part instanceof vscode.LanguageModelTextPart)) {
        filtered.push(part); continue;
      }
      const cleaned = _stripConfigShiftMarkers(part.value);
      if (cleaned === part.value) { filtered.push(part); continue; }
      changed = true; msgChanged = true;
      if (cleaned.length > 0) filtered.push(new vscode.LanguageModelTextPart(cleaned));
    }

    if (!msgChanged) { out.push(msg); continue; }
    if (filtered.length > 0) out.push({ ...msg, content: filtered });
    else changed = true;
  }

  return changed ? out : messages;
}

function _stripConfigShiftMarkers(text: string): string {
  const startIdx = text.indexOf(CONFIG_SHIFT_START);
  if (startIdx < 0) return text;
  const endIdx = text.indexOf(CONFIG_SHIFT_END, startIdx);
  if (endIdx < 0) return text.slice(0, startIdx);
  const before = text.slice(0, startIdx);
  const after = text.slice(endIdx + CONFIG_SHIFT_END.length);
  // Recursively strip multiple blocks
  return _stripConfigShiftMarkers(before + after);
}

function _makeStabilizerCallId(round: number, toolName: string): string {
  const h = createHash('sha256').update(toolName).digest('hex').slice(0, ACTIVATOR_NAME_HASH_LEN);
  return `${STABILIZER_CALL_ID_PFX}${round}_${h}`;
}

function _isStabilizerPart(part: unknown): boolean {
  if (part instanceof vscode.LanguageModelToolCallPart)
    return part.callId.startsWith(STABILIZER_CALL_ID_PFX);
  if (part instanceof vscode.LanguageModelToolResultPart)
    return part.callId.startsWith(STABILIZER_CALL_ID_PFX);
  return false;
}

function _isEmptyText(part: unknown): boolean {
  return part instanceof vscode.LanguageModelTextPart && part.value.length === 0;
}

interface StabilizerPart { round: number; toolName?: string }

function _parseStabilizerPart(part: unknown): StabilizerPart | undefined {
  if (part instanceof vscode.LanguageModelToolCallPart) {
    if (!part.callId.startsWith(STABILIZER_CALL_ID_PFX)) return undefined;
    const rest = part.callId.slice(STABILIZER_CALL_ID_PFX.length);
    const sep = rest.indexOf('_');
    if (sep < 0) return undefined;
    return { round: parseInt(rest.slice(0, sep), 10) || 0, toolName: part.name };
  }
  if (part instanceof vscode.LanguageModelToolResultPart) {
    if (!part.callId.startsWith(STABILIZER_CALL_ID_PFX)) return undefined;
    const rest = part.callId.slice(STABILIZER_CALL_ID_PFX.length);
    const sep = rest.indexOf('_');
    if (sep < 0) return undefined;
    return { round: parseInt(rest.slice(0, sep), 10) || 0 };
  }
  return undefined;
}

function _lastHumanMsgIndex(messages: readonly vscode.LanguageModelChatRequestMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== vscode.LanguageModelChatMessageRole.User) continue;
    if (msg.content.some(p => !(p instanceof vscode.LanguageModelToolResultPart))) return i;
  }
  return -1;
}
