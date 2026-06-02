// RateLimitGuard — 429 interceptor with thinking block + retry.
import type { Interceptor } from '../mesh/pipeline';
import type { Engine, Payload, StreamEvents } from '../mesh/contract';

const MAX = 3;

export class RateLimitGuard implements Interceptor {
  async intercept(
    payload: Payload, engine: Engine, sink: StreamEvents,
    signal: AbortSignal | undefined, next: () => Promise<void>
  ): Promise<void> {
    const origFault = sink.onFault;
    let attempts = 0;

    sink.onFault = async (err) => {
      if (attempts >= MAX || !_is429(err) || signal?.aborted) {
        await origFault(err); return;
      }
      attempts++;
      const secs = _parseWait(err) ?? 10;

      // Thinking block — clean single message with glow
      sink.onThinking(`Rate limited. Retrying in ${secs}s... (${attempts}/${MAX})`);
      await new Promise(r => setTimeout(r, secs * 1000));

      if (signal?.aborted) { await origFault(err); return; }

      // Start response on fresh line after the thinking block collapses
      sink.onToken('\n\n');
      await engine.stream(payload, sink, signal);
    };

    await next();
  }
}

function _is429(e: Error): boolean { return (e as any).status === 429; }
function _parseWait(e: Error): number | undefined {
  const m = (e as any).raw?.match(/try again in ([\d.]+)s/);
  return m ? Math.ceil(parseFloat(m[1])) : undefined;
}
