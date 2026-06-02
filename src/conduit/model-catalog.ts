// ModelCatalog — registry of all models exposed to the Copilot picker.
// Built-in models come from each provider. Users extend via copilot-adapter-kit.models.

import vscode from 'vscode';

export interface ModelMeta {
  id: string; name: string; family: string; version: string;
  detail: string;
  maxIn: number;
  maxOut: number;
  image: boolean;
  thinking: boolean;
  toolCalling: number;
  apiPath?: string;
}

/** Built-in models per provider family. Add entries here when adding new engines. */
export const BUILTIN_CATALOG: ModelMeta[] = [
  // ---- OpenAI (current as of 2026-06) ----
  { id: 'gpt-5.5',       name: 'GPT-5.5',         family: 'openai', version: 'gpt-5.5',       detail: 'Flagship — coding & complex reasoning',  maxIn: 1000000, maxOut: 128000, image: true, thinking: true,  toolCalling: 128 },
  { id: 'gpt-5.4',       name: 'GPT-5.4',         family: 'openai', version: 'gpt-5.4',       detail: 'Balanced price/performance',              maxIn: 1000000, maxOut: 128000, image: true, thinking: true,  toolCalling: 128 },
  { id: 'gpt-5.4-mini',  name: 'GPT-5.4 Mini',    family: 'openai', version: 'gpt-5.4-mini',  detail: 'Fast, affordable — best mini model',       maxIn: 400000,  maxOut: 128000, image: true, thinking: false, toolCalling: 128 },
  { id: 'gpt-5.4-nano',  name: 'GPT-5.4 Nano',    family: 'openai', version: 'gpt-5.4-nano',  detail: 'Lowest latency & cost',                    maxIn: 400000,  maxOut: 128000, image: true, thinking: false, toolCalling: 128 },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex',   family: 'openai', version: 'gpt-5.3-codex', apiPath: '/responses', detail: 'Agentic coding — Responses API only',      maxIn: 400000, maxOut: 128000, image: true, thinking: true,  toolCalling: 128 },
];

/** User-supplied models via copilot-adapter-kit.models setting. */
function loadUserModels(): ModelMeta[] {
  try {
    const raw = vscode.workspace.getConfiguration('copilot-adapter-kit').get<unknown[]>('models');
    if (!Array.isArray(raw)) return [];
    return raw.filter((m): m is ModelMeta =>
      typeof m === 'object' && m !== null &&
      typeof (m as any).id === 'string' && (m as any).id.length > 0 &&
      typeof (m as any).family === 'string' && (m as any).family.length > 0
    ).map(m => ({
      id:       (m as any).id,
      name:     (m as any).name     || (m as any).id,
      family:   (m as any).family,
      version:  (m as any).version  || 'custom',
      detail:   (m as any).detail   || 'User-defined model',
      maxIn:    (m as any).maxIn    || 128000,
      maxOut:   (m as any).maxOut   || 16384,
      image:    (m as any).image    ?? true,
      thinking: (m as any).thinking ?? false,
      toolCalling: (m as any).toolCalling ?? 128,
      apiPath:  (m as any).apiPath  || undefined,
    }));
  } catch { return []; }
}

export function resolveCatalog(showBuiltinModels = true): ModelMeta[] {
  const userModels = loadUserModels();
  const hiddenCustom: string[] = vscode.workspace.getConfiguration('copilot-adapter-kit').get<string[]>('hiddenCustomModels') || [];
  const visibleCustom = userModels.filter(m => !hiddenCustom.includes(`${m.family}:${m.id}`));
  if (!showBuiltinModels) return visibleCustom;
  const hidden: string[] = vscode.workspace.getConfiguration('copilot-adapter-kit').get<string[]>('hiddenBuiltins') || [];
  const overrides: Record<string, any> = vscode.workspace.getConfiguration('copilot-adapter-kit').get<Record<string, any>>('modelOverrides') || {};
  const mergedBuiltins = BUILTIN_CATALOG
    .filter(m => !hidden.includes(m.id))
    .map(m => overrides[m.id] ? { ...m, ...overrides[m.id] } : m);
  return [...mergedBuiltins, ...visibleCustom];
}

export function metaToVscode(meta: ModelMeta, hasKey: boolean): vscode.LanguageModelChatInformation {
  return {
    id: meta.id, name: meta.name, family: meta.family, version: meta.version,
    detail:       hasKey ? meta.detail : 'Run Copilot Adapter Kit: Set API Key',
    maxInputTokens:  meta.maxIn,
    maxOutputTokens: meta.maxOut,
    isUserSelectable: true,
    capabilities: { toolCalling: meta.toolCalling, imageInput: meta.image },
    ...(meta.thinking ? { configurationSchema: _thinkingSchema() } : {}),
    ...(!hasKey ? { statusIcon: new vscode.ThemeIcon('warning') } : {}),
  } as vscode.LanguageModelChatInformation;
}

function _thinkingSchema() {
  return {
    properties: {
      reasoningEffort: {
        type: 'string', title: 'Thinking Effort',
        enum: ['none', 'high', 'max'],
        enumItemLabels: ['None', 'High', 'Max'],
        default: 'high', group: 'navigation',
      },
    },
  };
}
