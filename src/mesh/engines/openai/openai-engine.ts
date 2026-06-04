import { Engine, Payload, StreamEvents, ToolSignal } from '../../contract';

interface SseChunk {
  choices?: [{ delta?: { content?: string; reasoning_content?: string;
    tool_calls?: [{ index: number; id?: string; function?: { name?: string; arguments?: string } }] };
    finish_reason?: string }];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class OpenAIEngine implements Engine {
  readonly family: string;
  private baseUrl = '';
  private apiKey = '';

  constructor(family = 'openai') {
    this.family = family;
  }

  configure(endpoint: string, key: string): void {
    this.baseUrl = endpoint; this.apiKey = key;
  }

  async stream(req: Payload, sink: StreamEvents, signal?: AbortSignal): Promise<void> {
    const apiPath = req.apiPath || '/chat/completions';
    const { apiPath: _, ...bodyReq } = req;
    const res = await fetch(`${this.baseUrl}${apiPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ ...bodyReq, stream_options: { include_usage: true } }),
      signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const msg = (() => { try { return JSON.parse(txt)?.error?.message || txt; } catch { return txt; } })();
      const err = new Error(`[${res.status}] ${msg}`) as Error & { status: number; raw: string };
      err.status = res.status; err.raw = txt;
      return sink.onFault(err) as any;
      return;
    }

    if (!res.body) { return sink.onFault(new Error('Empty response body')); return; }
    await this._drain(res.body, sink);
  }

  private async _drain(body: ReadableStream<Uint8Array>, sink: StreamEvents): Promise<void> {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const pending = new Map<number, ToolSignal>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line[0] === ':') continue;
        if (line === 'data: [DONE]') {
          for (const tc of pending.values()) sink.onToolSignal(tc);
          pending.clear();
          sink.onComplete();
          return;
        }
        if (!line.startsWith('data: ')) continue;
        try {
          const c: SseChunk = JSON.parse(line.slice(6));
          if (c.usage) sink.onReport?.(c.usage);
          const d = c.choices?.[0]?.delta; if (!d) continue;
          if (d.reasoning_content) sink.onThinking(d.reasoning_content);
          if (d.content) sink.onToken(d.content);
          if (d.tool_calls) {
            for (const tc of d.tool_calls) {
              let p = pending.get(tc.index);
              if (!p && tc.id) { p = { id: tc.id, type: 'function', function: { name: '', arguments: '' } }; pending.set(tc.index, p); }
              if (p) {
                if (tc.function?.name) p.function.name += tc.function.name;
                if (tc.function?.arguments) p.function.arguments += tc.function.arguments;
              }
            }
          }
          const fr = c.choices?.[0]?.finish_reason;
          if (fr === 'tool_calls' || fr === 'stop') {
            for (const tc of pending.values()) sink.onToolSignal(tc);
            pending.clear();
          }
        } catch { /* skip malformed */ }
      }
    }
    sink.onComplete();
  }
}
