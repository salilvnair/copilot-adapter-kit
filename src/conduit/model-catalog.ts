// ModelCatalog — registry of all models exposed to the Copilot picker.
// Built-in models come from each provider. Users extend via copilot-adapter-kit.models.

import vscode from 'vscode';

export interface ModelMeta {
  id: string; name: string; family: string; version: string;
  detail: string;
  tooltip?: string;
  maxIn: number;
  maxOut: number;
  image: boolean;
  thinking: boolean;
  toolCalling: number;
  apiPath?: string;
  visionFallback?: string;
  pricing?: string;
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
      visionFallback: (m as any).visionFallback || undefined,
      pricing:  (m as any).pricing  || undefined,
      tooltip:  (m as any).tooltip  || undefined,
    }));
  } catch { return []; }
}

export function resolveCatalog(): ModelMeta[] {
  const userModels = loadUserModels();
  const hiddenCustom: string[] = vscode.workspace.getConfiguration('copilot-adapter-kit').get<string[]>('hiddenCustomModels') || [];
  return userModels.filter(m => !hiddenCustom.includes(`${m.family}:${m.id}`));
}

export function metaToVscode(meta: ModelMeta, hasKey: boolean): vscode.LanguageModelChatInformation {
  // Only report imageInput: true if model natively supports images OR
  // a vision fallback is configured (per-model or global) so CAK can preprocess.
  const globalVf = vscode.workspace.getConfiguration('copilot-adapter-kit').get<string>('visionFallbackModel', '');
  const canHandleImages = meta.image || !!meta.visionFallback || !!globalVf;

  const costInfo = meta.pricing ? _buildCostInfo(meta) : {};

  return {
    id: meta.id, name: meta.name, family: meta.family, version: meta.version,
    detail:       hasKey ? meta.detail : 'Run Copilot Adapter Kit: Set API Key',
    tooltip:      hasKey ? (meta.tooltip || meta.detail) : undefined,
    maxInputTokens:  meta.maxIn,
    maxOutputTokens: meta.maxOut,
    isUserSelectable: true,
    capabilities: { toolCalling: meta.toolCalling, imageInput: canHandleImages },
    ...costInfo,
    ...(meta.thinking ? { configurationSchema: _thinkingOnlySchema() } : {}),
    ...(!hasKey ? { statusIcon: new vscode.ThemeIcon('warning') } : {}),
  } as vscode.LanguageModelChatInformation;
}

function _buildCostInfo(meta: ModelMeta): Record<string, string> {
  const parts = _parsePricing(meta.pricing!);
  if (!parts) return {};
  const info: Record<string, string> = {
    inputCost: parts.input,
    outputCost: parts.output,
  };
  if (parts.cache) info.cacheCost = parts.cache;
  // Auto-detect price category: ≤ $0.50/1M input → 'low' badge
  const inputVal = parseFloat(parts.input.replace('$', ''));
  if (!isNaN(inputVal) && inputVal <= 0.50) info.priceCategory = 'low';
  return info;
}

function _thinkingOnlySchema() {
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

function _parsePricing(input: string): { input: string; output: string; cache?: string } | null {
  // Try "in $X / out $Y / cache $Z"
  const m1 = input.match(/in\s*(\$[\d.]+)\s*(?:\/\s*|·\s*)?out\s*(\$[\d.]+)(?:\s*(?:\/\s*|·\s*)?cache\s*(\$[\d.]+))?/i);
  if (m1) return { input: m1[1], output: m1[2], cache: m1[3] || undefined };

  // Try "$X/$Y" or "$X/$Y (cache $Z)"
  const m2 = input.match(/^(\$[\d.]+)\s*\/\s*(\$[\d.]+)(?:\s*\(?cache\s*(\$[\d.]+)\)?)?/i);
  if (m2) return { input: m2[1], output: m2[2], cache: m2[3] || undefined };

  // Try "$X → $Y | cache $Z"
  const m3 = input.match(/^(\$[\d.]+)\s*[→>]\s*(\$[\d.]+)(?:\s*\|\s*cache\s*(\$[\d.]+))?/i);
  if (m3) return { input: m3[1], output: m3[2], cache: m3[3] || undefined };

  return null;
}
