// InterceptorPipeline — AOP-style chain wrapping every engine call.
// Each interceptor gets (payload, engine, next) and can short-circuit.
import { Engine, Payload, StreamEvents } from './contract';

export interface Interceptor {
  intercept(payload: Payload, engine: Engine, sink: StreamEvents, signal: AbortSignal | undefined, next: () => Promise<void>): Promise<void>;
}

export class InterceptorPipeline {
  private interceptors: Interceptor[] = [];

  use(interceptor: Interceptor): void { this.interceptors.push(interceptor); }

  wrap(engine: Engine): Engine {
    const chain = this.interceptors;
    return {
      family: engine.family,
      stream: async (payload, sink, signal) => {
        let idx = 0;
        const next = async (): Promise<void> => {
          if (idx < chain.length) {
            const i = chain[idx++];
            await i.intercept(payload, engine, sink, signal, next);
          } else {
            await engine.stream(payload, sink, signal);
          }
        };
        await next();
      },
    };
  }
}
