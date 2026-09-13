/* State shared by every settings screen.
 *
 * The extension host owns the truth: it reads settings.json and the keychain,
 * and pushes a whole snapshot on every change. The webview never writes
 * settings directly — it posts an intent and waits for the next snapshot. */

import { useEffect, useState } from 'react';
import { onMessage, post, vscode } from '../vscode';

export interface ProviderCfg {
  uuid?: string;
  family?: string;
  name?: string;
  baseUrl: string;
  defaultApiPath?: string;
  modelApiPaths?: Record<string, string>;
  modelAlias?: Record<string, string>;
  visionFallback?: string;
  _deleted?: boolean;
}

export interface ModelCfg {
  id: string;
  name?: string;
  family: string;
  detail?: string;
  maxIn?: number;
  maxOut?: number;
  image?: boolean;
  thinking?: boolean;
  toolCalling?: number;
  apiPath?: string;
  visionFallback?: string;
  pricing?: string;
  uuid?: string;
  _key?: string;
  parentUuid?: string;
  _deleted?: boolean;
}

/** What a reachability ping found. Never made with a key attached. */
export interface Health {
  /** The endpoint answered — any HTTP status counts, including 401. */
  reachable: boolean;
  ms?: number;
  status?: number;
  /** Set when a real request was rejected for authentication. */
  authFailedAt?: number;
  checkedAt?: number;
}

export interface BudgetSnapshot {
  caps: {
    enforce: boolean;
    dailyTokenLimit: number;
    dailyCostLimitUsd: number;
    maxInputTokensPerRequest: number;
    maxOutputTokens: number;
    maxTurnsPerConversation: number;
  };
  day: {
    day: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    requests: number;
    blocked: number;
    estimated: boolean;
    byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; requests: number }>;
    /** Tokens per local hour, 24 entries. Drives the burn curve. */
    hourly: number[];
    refusals: { at: number; reason: string; modelId: string; estimatedInput: number }[];
  };
  /** Finished days, oldest first. */
  history: { day: string; tokens: number; costUsd: number; requests: number; blocked: number; capped: boolean }[];
  tokenPct: number;
  costPct: number;
  overLimit: boolean;
  nearLimit: boolean;
}

export interface EngineFamily {
  family: string;
  label: string;
  defaultUrl: string;
  desc: string;
}

export interface AppState {
  /** True when the snapshot came from the dev fixture, not the extension. */
  isSample?: boolean;
  version: string;
  providers: Record<string, ProviderCfg>;
  models: Record<string, ModelCfg[]>;
  keys: Record<string, boolean>;
  health: Record<string, Health>;
  hiddenCustomModels: string[];
  engineFamilies: EngineFamily[];
  budget?: BudgetSnapshot;
  maxTokens: number;
  logLevel: string;
  stabilizeTools?: boolean;
  maxDiffFiles?: number;
  systemPrompt?: string;
  userPromptTemplate?: string;
  gitPrompt?: string;
  visionFallbackModel?: string;
  visionFallbackAlways?: boolean;
  /** Usage today per model id, for the card sparklines. */
  usageByModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; requests: number }>;
}

const EMPTY: AppState = {
  version: '',
  providers: {},
  models: {},
  keys: {},
  health: {},
  hiddenCustomModels: [],
  engineFamilies: [],
  maxTokens: 0,
  logLevel: 'quiet',
  usageByModel: {},
};

export function useAppState(): AppState | undefined {
  const [state, setState] = useState<AppState | undefined>(undefined);

  useEffect(() => {
    const off = onMessage(msg => {
      if (msg.type === 'state') {
        const p = msg.payload as Partial<AppState>;
        setState({ ...EMPTY, ...p, usageByModel: p.budget?.day.byModel ?? {} });
      }
    });
    post('getState');

    // Outside VS Code there is no host to answer, so a screen would render
    // empty. In dev, fall back to the mock's own data after a beat.
    if (import.meta.env.DEV && !vscode()) {
      void import('./fixture').then(({ FIXTURE }) =>
        setState({ ...FIXTURE, isSample: true, usageByModel: FIXTURE.budget?.day.byModel ?? {} }));
    }

    return off;
  }, []);

  return state;
}

/* ── Intents ──────────────────────────────────────────────────────────── */

export const actions = {
  saveProvider: (uuid: string, cfg: Partial<ProviderCfg>) => post('saveProvider', { uuid, providerConfig: cfg }),
  removeProvider: (uuid: string) => post('removeProvider', { uuid }),
  duplicateProvider: (uuid: string) => post('duplicateProvider', { uuid }),
  testProvider: (uuid: string) => post('testProvider', { uuid }),
  testAllProviders: () => post('testProvider', {}),
  setApiKey: (uuid: string, key: string) => post('setApiKey', { uuid, key }),
  clearApiKey: (uuid: string) => post('clearApiKey', { uuid }),
  saveModel: (entry: ModelCfg & { parentUuid: string }) => post('saveModel', entry),
  removeModel: (parentUuid: string, uuid: string) => post('removeModel', { parentUuid, uuid }),
  toggleModelVisible: (id: string, family: string) => post('toggleCustom', { id, family }),
  saveConfig: (key: string, value: unknown) => post('saveConfig', { key, value }),
  openSettings: () => post('openSettings'),
  openSpendGuard: () => post('openSpendGuard'),
  resetBudget: () => post('resetBudget'),
  openDumps: () => post('openDumps'),
  restoreProvider: (uuid: string) => post('restoreProvider', { uuid }),
  permDeleteProvider: (uuid: string) => post('permDeleteProvider', { uuid }),
  restoreModel: (parentUuid: string, uuid: string) => post('restoreModel', { parentUuid, uuid }),
  permDeleteModel: (parentUuid: string, uuid: string) => post('permDeleteModel', { parentUuid, uuid }),
  clearBin: () => post('clearBin'),
  deleteAllProviders: () => post('deleteAll'),
  clearAllKeys: () => post('clearAllKeys'),
  resetSettings: () => post('resetSettings'),
  factoryReset: () => post('factoryReset'),
  setGuard: (on: boolean) => post('setBudgetGuard', { on }),
};

/* ── Derived helpers ──────────────────────────────────────────────────── */

export function liveProviders(s: AppState): [string, ProviderCfg][] {
  return Object.entries(s.providers).filter(([, p]) => p && !p._deleted);
}

export function modelsFor(s: AppState, uuid: string): ModelCfg[] {
  return (s.models[uuid] ?? []).filter(m => m && !m._deleted);
}

/** Two letters for the provider mark.
 *
 * A compound name gives its initials the way the mock draws them — DeepSeek is
 * DS, OpenRouter is OR — and a single word gives its first two letters. */
export function mark(p: ProviderCfg): string {
  const raw = (p.name || p.family || '??').trim();
  const parts = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter(w => /[A-Za-z]/.test(w));
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const word = (parts[0] ?? raw).replace(/[^A-Za-z]/g, '');
  return (word.slice(0, 2) || '??').toUpperCase();
}

/** The host strips the scheme; the mock shows the bare authority and path. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export type ProvState = 'live' | 'warn' | 'err' | 'off';

/** Which of the mock's four card states a provider is in. */
export function provState(s: AppState, uuid: string, p: ProviderCfg): ProvState {
  const h = s.health[uuid];
  const local = /localhost|127\.0\.0\.1/.test(p.baseUrl);
  if (h?.authFailedAt) return 'err';
  if (h && !h.reachable) return 'off';
  if (!s.keys[uuid] && !local) return 'warn';
  return 'live';
}

export function fmtTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
