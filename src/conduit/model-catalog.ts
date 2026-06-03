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

/** Built-in models per provider family. Empty by design — users add their own via the Panel UI or copilot-adapter-kit.models setting. */
export const BUILTIN_CATALOG: ModelMeta[] = [];

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

export function resolveCatalog(): ModelMeta[] {
  const userModels = loadUserModels();
  const hiddenCustom: string[] = vscode.workspace.getConfiguration('copilot-adapter-kit').get<string[]>('hiddenCustomModels') || [];
  return userModels.filter(m => !hiddenCustom.includes(`${m.family}:${m.id}`));
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
