// BudgetLedger — persistent spend accounting and cap resolution.
//
// Copilot ships with a hard ceiling you must deliberately raise. This is the
// equivalent for BYOK providers: every request is checked against a daily
// token/cost budget before it leaves the machine, and enforcement is ON by
// default. Disabling it is an explicit, loudly-flagged user action.

import vscode from 'vscode';

const LEDGER_KEY = 'cak.budget.ledger.v1';
const UNLOCK_KEY = 'cak.budget.unlockedAt.v1';
const HISTORY_KEY = 'cak.budget.history.v1';

/** Days of history kept — fourteen weeks, which is what the heatmap draws. */
const HISTORY_DAYS = 98;
/** Refusals kept for the feed. */
const REFUSAL_CAP = 50;

/** Shipped defaults — strict, Copilot-like. */
export const BUDGET_DEFAULTS = {
  dailyTokenLimit: 2_000_000,
  dailyCostLimitUsd: 25,
  maxInputTokensPerRequest: 200_000,
  maxOutputTokens: 0,            // 0 = fall back to the model's declared maxOut
  maxTurnsPerConversation: 50,
  outputFallback: 16_384,        // used when a model declares no maxOut
} as const;

export interface ModelSpend {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  requests: number;
}

export interface LedgerDay {
  day: string;                   // YYYY-MM-DD, local time
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  requests: number;
  blocked: number;
  estimated: boolean;            // true once any figure came from an estimate
  byModel: Record<string, ModelSpend>;
  /** Tokens spent in each hour of the day, local time. Drives the burn curve. */
  hourly: number[];
  /** Cost in each hour, so the hover can draw the day's shape rather than a fill. */
  hourlyCost: number[];
  /** Most recent refusals, newest first. Capped — this is a feed, not a log. */
  refusals: Refusal[];
}

/** A request the guard turned away, and why. */
export interface Refusal {
  at: number;
  reason: string;
  modelId: string;
  /** What it would have sent, had it gone. */
  estimatedInput: number;
}

/** What is kept once a day is over. */
export interface DaySummary {
  day: string;
  tokens: number;
  costUsd: number;
  requests: number;
  blocked: number;
  /** The day ended at or above a limit. */
  capped: boolean;
}

export interface BudgetCaps {
  enforce: boolean;
  dailyTokenLimit: number;
  dailyCostLimitUsd: number;
  maxInputTokensPerRequest: number;
  maxOutputTokens: number;
  maxTurnsPerConversation: number;
}

export interface BudgetStatus {
  caps: BudgetCaps;
  day: LedgerDay;
  /** Finished days, oldest first. */
  history: DaySummary[];
  tokenPct: number;              // 0..100+, -1 when the limit is disabled
  costPct: number;
  overLimit: boolean;
  nearLimit: boolean;            // >= 80%
  unlockedAt?: number;
}

/** Pricing in USD per 1M tokens. */
export interface PricingUsd { input: number; output: number; cache?: number }

export class BudgetLedger {
  private day: LedgerDay = _emptyDay();
  private history: DaySummary[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private readonly listeners = new Set<(s: BudgetStatus) => void>();
  /** Per-conversation turn counters, reset when the extension host restarts. */
  private turns = new Map<string, number>();

  constructor(private ext: vscode.ExtensionContext) {
    const stored = ext.globalState.get<LedgerDay>(LEDGER_KEY);
    this.history = ext.globalState.get<DaySummary[]>(HISTORY_KEY) ?? [];
    if (stored && stored.day === _today()) {
      this.day = _normalise(stored);
    } else {
      // The extension was last used on an earlier day; file it before starting.
      if (stored) this._archive(_normalise(stored));
      this.day = _emptyDay();
    }
  }

  // ---- Caps ----

  get caps(): BudgetCaps {
    const c = vscode.workspace.getConfiguration('copilot-adapter-kit');
    const n = (key: string, fallback: number) => {
      const v = c.get<number>(key);
      return typeof v === 'number' && v >= 0 ? v : fallback;
    };
    return {
      enforce: c.get<boolean>('budget.enforce', true) !== false,
      dailyTokenLimit: n('budget.dailyTokenLimit', BUDGET_DEFAULTS.dailyTokenLimit),
      dailyCostLimitUsd: n('budget.dailyCostLimitUsd', BUDGET_DEFAULTS.dailyCostLimitUsd),
      maxInputTokensPerRequest: n('budget.maxInputTokensPerRequest', BUDGET_DEFAULTS.maxInputTokensPerRequest),
      maxOutputTokens: n('budget.maxOutputTokens', BUDGET_DEFAULTS.maxOutputTokens),
      maxTurnsPerConversation: n('budget.maxTurnsPerConversation', BUDGET_DEFAULTS.maxTurnsPerConversation),
    };
  }

  /** Resolve max_tokens to send. Never undefined — unbounded output is not an option. */
  resolveOutputCap(modelMaxOut: number | undefined, userMaxTokens: number | undefined): number {
    const caps = this.caps;
    const candidates = [
      userMaxTokens && userMaxTokens > 0 ? userMaxTokens : undefined,
      caps.maxOutputTokens > 0 ? caps.maxOutputTokens : undefined,
      modelMaxOut && modelMaxOut > 0 ? modelMaxOut : undefined,
      BUDGET_DEFAULTS.outputFallback,
    ].filter((v): v is number => typeof v === 'number');
    // Tightest wins: an explicit budget cap must be able to pull a request down.
    return Math.min(...candidates);
  }

  // ---- Status ----

  get today(): LedgerDay { this._rollover(); return this.day; }

  status(): BudgetStatus {
    this._rollover();
    const caps = this.caps;
    const totalTokens = this.day.inputTokens + this.day.outputTokens;
    const tokenPct = caps.dailyTokenLimit > 0
      ? (totalTokens / caps.dailyTokenLimit) * 100 : -1;
    const costPct = caps.dailyCostLimitUsd > 0
      ? (this.day.costUsd / caps.dailyCostLimitUsd) * 100 : -1;
    const worst = Math.max(tokenPct, costPct);
    return {
      caps, day: this.day, history: this.history, tokenPct, costPct,
      overLimit: worst >= 100,
      nearLimit: worst >= 80,
      unlockedAt: this.ext.globalState.get<number>(UNLOCK_KEY),
    };
  }

  onChange(fn: (s: BudgetStatus) => void): vscode.Disposable {
    this.listeners.add(fn);
    return new vscode.Disposable(() => this.listeners.delete(fn));
  }

  // ---- Pre-flight ----

  /** Reason a request must be refused, or undefined when it may proceed. */
  checkRequest(estimatedInput: number, conversationKey: string): string | undefined {
    this._rollover();
    const caps = this.caps;
    if (!caps.enforce) return undefined;

    const totalTokens = this.day.inputTokens + this.day.outputTokens;

    if (caps.dailyTokenLimit > 0 && totalTokens >= caps.dailyTokenLimit) {
      return `Daily token budget reached — ${_fmt(totalTokens)} of ${_fmt(caps.dailyTokenLimit)} tokens used today.`;
    }
    if (caps.dailyCostLimitUsd > 0 && this.day.costUsd >= caps.dailyCostLimitUsd) {
      return `Daily cost budget reached — $${this.day.costUsd.toFixed(2)} of $${caps.dailyCostLimitUsd.toFixed(2)} spent today.`;
    }
    if (caps.dailyTokenLimit > 0 && totalTokens + estimatedInput > caps.dailyTokenLimit) {
      return `This request (~${_fmt(estimatedInput)} input tokens) would exceed today's budget of ${_fmt(caps.dailyTokenLimit)} tokens (${_fmt(totalTokens)} already used).`;
    }
    if (caps.maxInputTokensPerRequest > 0 && estimatedInput > caps.maxInputTokensPerRequest) {
      return `Request too large — ~${_fmt(estimatedInput)} input tokens exceeds the per-request limit of ${_fmt(caps.maxInputTokensPerRequest)}.`;
    }
    if (caps.maxTurnsPerConversation > 0) {
      const turns = this.turns.get(conversationKey) ?? 0;
      if (turns >= caps.maxTurnsPerConversation) {
        return `Agent loop guard — ${turns} requests already sent for this conversation (limit ${caps.maxTurnsPerConversation}). Start a new chat to continue.`;
      }
    }
    return undefined;
  }

  /** Count an accepted request against its conversation's turn budget. */
  countTurn(conversationKey: string): number {
    const n = (this.turns.get(conversationKey) ?? 0) + 1;
    this.turns.set(conversationKey, n);
    if (this.turns.size > 200) {
      const oldest = this.turns.keys().next().value;
      if (oldest) this.turns.delete(oldest);
    }
    return n;
  }

  resetTurns(): void { this.turns.clear(); }

  // ---- Recording ----

  record(entry: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    pricing?: PricingUsd;
    estimated?: boolean;
  }): void {
    this._rollover();
    const cost = entry.pricing
      ? (entry.inputTokens / 1e6) * entry.pricing.input + (entry.outputTokens / 1e6) * entry.pricing.output
      : 0;

    this.day.inputTokens += entry.inputTokens;
    this.day.outputTokens += entry.outputTokens;
    this.day.costUsd += cost;
    this.day.requests += 1;
    if (entry.estimated) this.day.estimated = true;

    // Bucket by local hour so the burn curve can be drawn against the ceiling.
    const hour = new Date().getHours();
    this.day.hourly[hour] = (this.day.hourly[hour] ?? 0) + entry.inputTokens + entry.outputTokens;
    this.day.hourlyCost[hour] = (this.day.hourlyCost[hour] ?? 0) + cost;

    const m = this.day.byModel[entry.modelId] ??= { inputTokens: 0, outputTokens: 0, costUsd: 0, requests: 0 };
    m.inputTokens += entry.inputTokens;
    m.outputTokens += entry.outputTokens;
    m.costUsd += cost;
    m.requests += 1;

    this._flush();
  }

  recordBlocked(detail?: { reason: string; modelId: string; estimatedInput: number }): void {
    this._rollover();
    this.day.blocked += 1;
    if (detail) {
      this.day.refusals.unshift({ at: Date.now(), ...detail });
      if (this.day.refusals.length > REFUSAL_CAP) this.day.refusals.length = REFUSAL_CAP;
    }
    this._flush();
  }

  async reset(): Promise<void> {
    this.day = _emptyDay();
    this.turns.clear();
    await this.ext.globalState.update(LEDGER_KEY, this.day);
    this._notify();
  }

  // ---- Override ----

  async setEnforcement(on: boolean): Promise<void> {
    await vscode.workspace.getConfiguration('copilot-adapter-kit')
      .update('budget.enforce', on, vscode.ConfigurationTarget.Global);
    await this.ext.globalState.update(UNLOCK_KEY, on ? undefined : Date.now());
    this._notify();
  }

  // ---- Internals ----

  private _rollover(): void {
    const t = _today();
    if (this.day.day !== t) {
      this._archive(this.day);
      this.day = _emptyDay();
      this.turns.clear();
      void this.ext.globalState.update(LEDGER_KEY, this.day);
    }
  }

  /** File a finished day into history, keeping the most recent HISTORY_DAYS. */
  private _archive(day: LedgerDay): void {
    const tokens = day.inputTokens + day.outputTokens;
    if (tokens === 0 && day.requests === 0 && day.blocked === 0) return;
    const caps = this.caps;
    this.history = [
      ...this.history.filter(d => d.day !== day.day),
      {
        day: day.day,
        tokens,
        costUsd: day.costUsd,
        requests: day.requests,
        blocked: day.blocked,
        capped: (caps.dailyTokenLimit > 0 && tokens >= caps.dailyTokenLimit)
          || (caps.dailyCostLimitUsd > 0 && day.costUsd >= caps.dailyCostLimitUsd),
      },
    ].slice(-HISTORY_DAYS);
    void this.ext.globalState.update(HISTORY_KEY, this.history);
  }

  private _flush(): void {
    this._notify();
    if (this.flushTimer) return;
    // Coalesce writes — a streaming agent run can report usage many times a second.
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.ext.globalState.update(LEDGER_KEY, this.day);
    }, 2000);
    this.flushTimer.unref?.();
  }

  private _notify(): void {
    const s = this.status();
    for (const fn of this.listeners) { try { fn(s); } catch { /* a listener must not break accounting */ } }
  }
}

// ---- Helpers ----

function _today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _emptyDay(): LedgerDay {
  return {
    day: _today(), inputTokens: 0, outputTokens: 0, costUsd: 0, requests: 0, blocked: 0,
    estimated: false, byModel: {},
    hourly: new Array(24).fill(0), hourlyCost: new Array(24).fill(0), refusals: [],
  };
}

function _normalise(d: Partial<LedgerDay>): LedgerDay {
  return {
    day: d.day ?? _today(),
    inputTokens: d.inputTokens ?? 0,
    outputTokens: d.outputTokens ?? 0,
    costUsd: d.costUsd ?? 0,
    requests: d.requests ?? 0,
    blocked: d.blocked ?? 0,
    estimated: d.estimated ?? false,
    byModel: d.byModel ?? {},
    hourly: Array.isArray(d.hourly) && d.hourly.length === 24 ? d.hourly : new Array(24).fill(0),
    hourlyCost: Array.isArray(d.hourlyCost) && d.hourlyCost.length === 24
      ? d.hourlyCost : new Array(24).fill(0),
    refusals: d.refusals ?? [],
  };
}

export function fmtTokens(n: number): string { return _fmt(n); }

function _fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Parse a model's pricing string into USD per 1M tokens. */
export function parsePricingUsd(pricing: string | undefined): PricingUsd | undefined {
  if (!pricing) return undefined;
  const num = (s: string) => parseFloat(s.replace('$', ''));
  const forms = [
    /in\s*(\$[\d.]+)\s*(?:\/\s*|·\s*)?out\s*(\$[\d.]+)(?:\s*(?:\/\s*|·\s*)?cache\s*(\$[\d.]+))?/i,
    /^(\$[\d.]+)\s*\/\s*(\$[\d.]+)(?:\s*\(?cache\s*(\$[\d.]+)\)?)?/i,
    /^(\$[\d.]+)\s*[→>]\s*(\$[\d.]+)(?:\s*\|\s*cache\s*(\$[\d.]+))?/i,
  ];
  for (const re of forms) {
    const m = pricing.match(re);
    if (!m) continue;
    const input = num(m[1]), output = num(m[2]);
    if (isNaN(input) || isNaN(output)) continue;
    const cache = m[3] ? num(m[3]) : undefined;
    return { input, output, cache: cache !== undefined && !isNaN(cache) ? cache : undefined };
  }
  return undefined;
}
