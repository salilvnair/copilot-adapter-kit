// BudgetWarden — the spend governor. Runs FIRST in the interceptor chain.
//
// Two jobs:
//   1. Pre-flight — refuse a request that would breach the daily budget, the
//      per-request input ceiling, or the agent-loop turn limit. A refused
//      request never reaches the network, so it costs nothing.
//   2. Accounting — record what every request actually consumed. Real usage
//      from the provider is preferred; when a provider reports nothing we fall
//      back to a deliberately over-stated estimate so the budget still moves.
//
// Because this interceptor installs its handlers on the *sink object* before
// RateLimitGuard wraps it, retries issued from inside RateLimitGuard (which
// call engine.stream directly and bypass the chain) are still accounted for.

import { createHash } from 'crypto';
import vscode from 'vscode';
import type { BudgetLedger } from '../kernel/budget';
import { fmtTokens, parsePricingUsd } from '../kernel/budget';
import type { Engine, Payload, StreamEvents, UsageReport } from '../mesh/contract';
import type { Interceptor } from '../mesh/pipeline';
import { estimatePayloadTokens, tokenMath } from '../tooling/token-math';
import { logger } from './diag-tracer';

/** Thrown when a request is refused before it is sent. */
export class BudgetBlockedError extends Error {
  readonly budgetBlocked = true;
  constructor(message: string) { super(message); this.name = 'BudgetBlockedError'; }
}

export class BudgetWarden implements Interceptor {
  /** Throttles the "budget reached" popup to once per reason per 10 minutes. */
  private lastNotice = new Map<string, number>();

  constructor(private ledger: BudgetLedger) {}

  async intercept(
    payload: Payload, _engine: Engine, sink: StreamEvents,
    _signal: AbortSignal | undefined, next: () => Promise<void>,
  ): Promise<void> {
    const meta = payload._budget;
    const modelId = meta?.pickerId || payload.model;
    const estimatedInput = estimatePayloadTokens(payload, tokenMath.charsPerToken);
    const convKey = _conversationKey(payload);

    // ---- 1. Pre-flight ----
    const refusal = this.ledger.checkRequest(estimatedInput, convKey);
    if (refusal) {
      this.ledger.recordBlocked({ reason: refusal, modelId, estimatedInput });
      logger().error(`[budget] BLOCKED ${modelId} — ${refusal}`);
      this._notify(refusal);
      await sink.onFault(new BudgetBlockedError(_renderRefusal(refusal)));
      return;   // never reaches the network
    }
    this.ledger.countTurn(convKey);

    // ---- 2. Output ceiling — unbounded output is never sent ----
    payload.max_tokens = this.ledger.resolveOutputCap(meta?.maxOut, payload.max_tokens);

    // ---- 3. Accounting ----
    const pricing = parsePricingUsd(meta?.pricing);
    let reported: UsageReport | undefined;
    let streamedChars = 0;
    let settled = false;

    const commit = () => {
      if (settled) return;
      settled = true;
      if (reported) {
        // Anthropic's delta events carry output-only usage; keep our input estimate then.
        const inputTokens = reported.prompt_tokens > 0 ? reported.prompt_tokens : estimatedInput;
        this.ledger.record({
          modelId,
          inputTokens,
          outputTokens: reported.completion_tokens,
          pricing,
          estimated: reported.prompt_tokens <= 0,
        });
      } else {
        // Provider sent no usage frame — charge the estimate so the budget still moves.
        this.ledger.record({
          modelId,
          inputTokens: estimatedInput,
          outputTokens: Math.ceil(streamedChars / tokenMath.charsPerToken),
          pricing,
          estimated: true,
        });
      }
    };

    const origReport = sink.onReport;
    sink.onReport = (u: UsageReport) => {
      // Providers may send several usage frames; the last one is authoritative.
      reported = reported && u.prompt_tokens <= 0
        ? { ...reported, completion_tokens: Math.max(reported.completion_tokens, u.completion_tokens), total_tokens: u.total_tokens }
        : u;
      if (u.total_tokens > 0) {
        tokenMath.calibrate(u.total_tokens, JSON.stringify(payload.messages).length);
      }
      origReport?.(u);
    };

    const origToken = sink.onToken;
    sink.onToken = (t: string) => { streamedChars += t.length; origToken(t); };

    const origThinking = sink.onThinking;
    sink.onThinking = (t: string) => { streamedChars += t.length; origThinking(t); };

    const origComplete = sink.onComplete;
    sink.onComplete = () => { commit(); origComplete(); };

    const origFault = sink.onFault;
    sink.onFault = async (e: Error) => { commit(); await origFault(e); };

    await next();
    // A stream that ends without either callback (aborted mid-flight) still billed.
    commit();
  }

  private _notify(reason: string): void {
    const key = reason.slice(0, 40);
    const now = Date.now();
    const last = this.lastNotice.get(key) ?? 0;
    if (now - last < 10 * 60 * 1000) return;
    this.lastNotice.set(key, now);

    void vscode.window.showWarningMessage(
      `Copilot Adapter Kit blocked a request — ${reason}`,
      'Open Spend Guard',
    ).then(choice => {
      if (choice === 'Open Spend Guard') void vscode.commands.executeCommand('copilot-adapter-kit.showUsage');
    });
  }
}

/** Message shown in the chat response when a request is refused. */
function _renderRefusal(reason: string): string {
  return [
    `🛑 **Request blocked by the spend guard.**`,
    '',
    reason,
    '',
    'Nothing was sent to the provider, so this cost you nothing.',
    '',
    'To continue: raise the limits in **Copilot Adapter Kit → Budget**, wait for the daily reset, ',
    'or run **Copilot Adapter Kit: Disable Spend Guard** to remove protection entirely (not recommended).',
  ].join('\n');
}

/** Stable key for a conversation — the opening messages, which agent turns preserve. */
function _conversationKey(payload: Payload): string {
  const head = (payload.messages ?? []).slice(0, 2)
    .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 4096))
    .join('|');
  return createHash('sha256').update(`${payload.model}:${head}`).digest('hex').slice(0, 16);
}

export { fmtTokens };
