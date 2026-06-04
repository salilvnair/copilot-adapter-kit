// Anthropic Engine — native Anthropic Messages API over SSE streaming.
import { Engine, Payload, StreamEvents } from '../../contract';
import { toAnthropicRequest, type AnthropicContentBlock } from './anthropic-wire-format';

interface AnthropicSseEvent {
  type: string;
  message?: {
    id: string; model: string; role: string;
    content: AnthropicContentBlock[];
    stop_reason: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: { input_tokens: number; output_tokens: number };
}

export class AnthropicEngine implements Engine {
  readonly family = 'anthropic';
  private baseUrl = '';
  private apiKey = '';

  configure(endpoint: string, key: string): void {
    this.baseUrl = endpoint;
    this.apiKey = key;
  }

  async stream(req: Payload, sink: StreamEvents, signal?: AbortSignal): Promise<void> {
    const body = toAnthropicRequest(req);
    const apiPath = '/messages';  // baseUrl already includes /v1

    const res = await fetch(`${this.baseUrl}${apiPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        ...(body.thinking ? { 'anthropic-beta': 'thinking-2025-01-07' } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const msg = (() => {
        try { const j = JSON.parse(txt); return j.error?.message || txt; } catch { return txt; }
      })();
      const err = new Error(`[${res.status}] ${msg}`) as Error & { status: number; raw: string };
      err.status = res.status;
      err.raw = txt;
      await sink.onFault(err);
      return;
    }

    if (!res.body) {
      await sink.onFault(new Error('Empty response body'));
      return;
    }

    if (!body.stream) {
      // Non-streaming — parse the full JSON response
      const txt = await res.text();
      try {
        const j = JSON.parse(txt);
        for (const block of j.content || []) {
          if (block.type === 'text' && block.text) {
            sink.onToken(block.text);
          } else if (block.type === 'tool_use') {
            sink.onToolSignal({
              id: block.id,
              type: 'function',
              function: { name: block.name, arguments: JSON.stringify(block.input || {}) },
            });
          } else if (block.type === 'thinking' && block.thinking) {
            sink.onThinking(block.thinking);
          }
        }
        if (j.usage) sink.onReport?.(j.usage);
      } catch {
        await sink.onFault(new Error('Failed to parse Anthropic response'));
        return;
      }
      sink.onComplete();
      return;
    }

    await this._drainStream(res.body, sink);
  }

  private async _drainStream(body: ReadableStream<Uint8Array>, sink: StreamEvents): Promise<void> {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    const pendingTools = new Map<number, { id: string; name: string; input: string }>();
    const contentIndex = new Map<number, string>(); // index → accumulated text

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });

      const parts = buf.split('\n\n');
      buf = parts.pop() || '';

      for (const part of parts) {
        const lines = part.split('\n');
        let eventType = '';
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            data = line.slice(6);
          }
        }

        if (!data) continue;
        let ev: AnthropicSseEvent;
        try { ev = JSON.parse(data); } catch { continue; }

        switch (ev.type) {
          case 'message_start': {
            if (ev.message?.usage) {
              sink.onReport?.({
                prompt_tokens: ev.message.usage.input_tokens,
                completion_tokens: ev.message.usage.output_tokens,
                total_tokens: ev.message.usage.input_tokens + ev.message.usage.output_tokens,
              });
            }
            break;
          }

          case 'content_block_start': {
            const idx = ev.index ?? 0;
            const block = ev.content_block;
            if (!block) break;

            if (block.type === 'text') {
              contentIndex.set(idx, block.text || '');
            } else if (block.type === 'tool_use') {
              pendingTools.set(idx, { id: block.id || '', name: block.name || '', input: '' });
            } else if (block.type === 'thinking' && block.thinking) {
              sink.onThinking(block.thinking);
            }
            break;
          }

          case 'content_block_delta': {
            const idx = ev.index ?? 0;
            const delta = ev.delta;
            if (!delta) break;

            if (delta.type === 'text_delta' && delta.text) {
              const prev = contentIndex.get(idx) || '';
              contentIndex.set(idx, prev + delta.text);
              sink.onToken(delta.text);
            } else if (delta.type === 'input_json_delta' && delta.partial_json) {
              const p = pendingTools.get(idx);
              if (p) p.input += delta.partial_json;
            } else if (delta.type === 'thinking_delta' && delta.thinking) {
              sink.onThinking(delta.thinking);
            }
            break;
          }

          case 'content_block_stop': {
            const idx = ev.index ?? 0;
            // Flush accumulated text (already streamed)
            contentIndex.delete(idx);
            break;
          }

          case 'message_delta': {
            const usage = ev.usage || (ev as any).delta?.usage;
            if (usage) {
              sink.onReport?.({
                prompt_tokens: 0,
                completion_tokens: usage.output_tokens || 0,
                total_tokens: usage.output_tokens || 0,
              });
            }
            break;
          }

          case 'message_stop': {
            // Flush any pending tool calls
            for (const [, pt] of pendingTools) {
              if (pt.id) {
                let args = '{}';
                try { args = JSON.stringify(JSON.parse(pt.input || '{}')); } catch { args = pt.input || '{}'; }
                sink.onToolSignal({ id: pt.id, type: 'function', function: { name: pt.name, arguments: args } });
              }
            }
            pendingTools.clear();
            sink.onComplete();
            return;
          }

          case 'error': {
            const errMsg = (ev as any).error?.message || 'Anthropic stream error';
            await sink.onFault(new Error(errMsg));
            return;
          }
        }
      }
    }
    sink.onComplete();
  }
}
