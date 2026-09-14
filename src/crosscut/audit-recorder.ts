// AuditRecorder — one row per model call, written after the call finishes.
//
// The same reasoning daakia's request audit is built on: everything worth
// auditing about a request only exists once it is over. What was sent, what came
// back, how long it took, what it cost, which model actually answered. "Why did
// this behave differently to yesterday" is the question an audit log exists to
// answer, and a method and a URL cannot answer it.
//
// Prompt and response bodies are OFF by default. For this extension the payload
// is your source code and your prompts, and an audit database sitting on disk
// holding those is a different proposition to one holding HTTP metadata. Turn
// `audit.recordBodies` on when you need it.

import { createHash } from 'crypto';
import vscode from 'vscode';
import { parsePricingUsd } from '../kernel/budget';
import type { Engine, Payload, StreamEvents, UsageReport } from '../mesh/contract';
import type { Interceptor } from '../mesh/pipeline';
import { insertAudit } from '../storage/db';
import { estimatePayloadTokens, tokenMath } from '../tooling/token-math';

/** Bodies are clipped so one long response cannot fill the database. */
const MAX_BODY_CHARS = 8_000;

export class AuditRecorder implements Interceptor {
  async intercept(
    payload: Payload, _engine: Engine, sink: StreamEvents,
    _signal: AbortSignal | undefined, next: () => Promise<void>,
  ): Promise<void> {
    const cfg = () => vscode.workspace.getConfiguration('copilot-adapter-kit');
    if (cfg().get<boolean>('audit.enabled', true) === false) {
      await next();
      return;
    }

    const withBodies = cfg().get<boolean>('audit.recordBodies', false) === true;
    const meta = payload._budget;
    const started = Date.now();

    let usage: UsageReport | undefined;
    let answer = '';
    let failure: string | undefined;
    let written = false;

    const commit = (stage: string) => {
      if (written) return;
      written = true;

      const inputTokens = usage?.prompt_tokens && usage.prompt_tokens > 0
        ? usage.prompt_tokens
        : estimatePayloadTokens(payload, tokenMath.charsPerToken);
      const outputTokens = usage?.completion_tokens
        ?? Math.ceil(answer.length / tokenMath.charsPerToken);
      const price = parsePricingUsd(meta?.pricing);

      insertAudit({
        conversation_id: _conversationId(payload),
        stage,
        provider: payload._budget?.pickerId?.split(':')[0],
        model: payload.model,
        system_prompt: withBodies ? _clip(_systemOf(payload)) : undefined,
        user_prompt: withBodies ? _clip(_lastUserOf(payload)) : undefined,
        request_payload: withBodies ? _clip(JSON.stringify(payload.messages)) : undefined,
        response_payload: withBodies ? _clip(answer) : undefined,
        // Never the key, and never a header that could carry one.
        headers: JSON.stringify({ apiPath: payload.apiPath ?? '/chat/completions' }),
        meta: JSON.stringify({
          messages: payload.messages?.length ?? 0,
          tools: payload.tools?.length ?? 0,
          maxTokens: payload.max_tokens,
          estimated: !usage,
          bodiesRecorded: withBodies,
        }),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: price
          ? (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output
          : undefined,
        duration_ms: Date.now() - started,
        error: failure,
      });
    };

    const origReport = sink.onReport;
    sink.onReport = u => { usage = u; origReport?.(u); };

    const origToken = sink.onToken;
    sink.onToken = t => { if (withBodies && answer.length < MAX_BODY_CHARS) answer += t; origToken(t); };

    const origComplete = sink.onComplete;
    sink.onComplete = () => { commit('chat.complete'); origComplete(); };

    const origFault = sink.onFault;
    sink.onFault = async e => {
      failure = (e as Error)?.message ?? String(e);
      commit((e as { budgetBlocked?: boolean }).budgetBlocked ? 'chat.refused' : 'chat.error');
      await origFault(e);
    };

    await next();
    commit('chat.complete');
  }
}

/** Stable per-conversation id — the opening messages, which agent turns keep. */
function _conversationId(payload: Payload): string {
  const head = (payload.messages ?? []).slice(0, 2)
    .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 4096))
    .join('|');
  return createHash('sha256').update(`${payload.model}:${head}`).digest('hex').slice(0, 16);
}

function _systemOf(payload: Payload): string {
  const first = payload.messages?.[0];
  if (!first || first.role !== 'system') return '';
  return typeof first.content === 'string' ? first.content : JSON.stringify(first.content);
}

function _lastUserOf(payload: Payload): string {
  const users = (payload.messages ?? []).filter(m => m.role === 'user');
  const last = users[users.length - 1];
  if (!last) return '';
  return typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
}

function _clip(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.length <= MAX_BODY_CHARS
    ? text
    : `${text.slice(0, MAX_BODY_CHARS)}\n… truncated, ${text.length - MAX_BODY_CHARS} more characters`;
}
