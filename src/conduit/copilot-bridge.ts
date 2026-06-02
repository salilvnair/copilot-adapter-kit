// CopilotBridge — sole entry point VS Code Copilot sees.
// Resolves model → family → provider config + key → engine.
import vscode from 'vscode';
import { stabilizeToolFlow } from '../crosscut/tool-stabilizer';
import { Context } from '../kernel/context';
import { Payload, ToolSignal } from '../mesh/contract';
import { forgeEnvelopes, forgeTools } from '../mesh/engines/openai/wire-format';
import { metaToVscode, resolveCatalog } from './model-catalog';

export class CopilotBridge implements vscode.LanguageModelChatProvider {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.emitter.event;
  private alive = true;

  constructor(private ctx: Context) {}

  signal(): void { this.emitter.fire(); }

  async provideLanguageModelChatInformation(): Promise<vscode.LanguageModelChatInformation[]> {
    if (!this.alive) return [];
    const ready = await this.ctx.vault.present();
    return resolveCatalog(this.ctx.tuning.showBuiltinModels).map(m => metaToVscode(m, ready));
  }

  async provideLanguageModelChatResponse(
    info: vscode.LanguageModelChatInformation,
    msgs: readonly vscode.LanguageModelChatRequestMessage[],
    opts: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const meta = resolveCatalog(this.ctx.tuning.showBuiltinModels).find(m => m.id === info.id);
    const family = meta?.family ?? 'openai';

    // Resolve per‑family credentials
    const provider = this.ctx.tuning.provider(family);
    if (!provider.baseUrl) {
      throw new Error(`No baseUrl configured for provider "${family}". Add it under copilot-adapter-kit.providers.${family}.baseUrl in Settings.`);
    }
    const key = await this.ctx.vault.fetch(family);
    if (!key) {
      throw new Error(`No API key for "${family}". Run Copilot Adapter Kit: Set API Key.`);
    }

    const engine = this.ctx.discovery.lookup(family);
    engine.configure?.(provider.baseUrl, key);

    const modelId = this.ctx.tuning.resolveModelId(info.id, family);

    // Tool stabilization: pre-activate tools so the tools array stays identical
    const toolFlow = stabilizeToolFlow(
      this.ctx.tuning.stabilizeTools, msgs, opts.tools, progress);
    if (toolFlow.intercepted) return;
    const resolvedMsgs = toolFlow.messages;

    const payload: Payload = {
      model: modelId,
      messages: forgeEnvelopes(resolvedMsgs, meta?.image ?? true),
      stream: true,
      tools: forgeTools(opts.tools),
      tool_choice: opts.tools?.length ? 'auto' : undefined,
      max_tokens: this.ctx.tuning.maxTokens,
      apiPath: meta?.apiPath || this.ctx.tuning.resolveApiPath(info.id, family),
    };

    const wrapped = this.ctx.pipeline.wrap(engine);
    const ctrl = new AbortController();
    const disp = token.onCancellationRequested(() => ctrl.abort());
    if (token.isCancellationRequested) { ctrl.abort(); disp.dispose(); return; }

    try {
      const emitted = new Set<string>();
      await wrapped.stream(payload, {
        onToken: t => progress.report(new vscode.LanguageModelTextPart(t)),
        onThinking: t => {
          const T = (vscode as any).LanguageModelThinkingPart;
          progress.report(T ? new T(t, 'cak-thinking') : new vscode.LanguageModelTextPart(t));
        },
        onToolSignal: (tc: ToolSignal) => {
          if (emitted.has(tc.id)) return; emitted.add(tc.id);
          try { progress.report(new vscode.LanguageModelToolCallPart(tc.id, tc.function.name, JSON.parse(tc.function.arguments || '{}'))); }
          catch { progress.report(new vscode.LanguageModelToolCallPart(tc.id, tc.function.name, {})); }
        },
        onFault: e => {
          const msg = (e as any)?.message || String(e);
          const status = (e as any)?.status;
          const raw = (e as any)?.raw;
          const detail = raw ? `\n\n<details><summary>Details</summary>\n\n\`\`\`json\n${raw.slice(0, 500)}\n\`\`\`\n</details>` : '';
          progress.report(new vscode.LanguageModelTextPart(
            status ? `❌ Error ${status} — ${msg}${detail}` : `❌ ${msg}${detail}`
          ));
        },
        onComplete: () => {},
      }, ctrl.signal);
    } finally { disp.dispose(); }
  }

  async provideTokenCount(
    _info: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    const s = typeof text === 'string' ? text
      : (text as any).content?.map((p: any) => p.value ?? '').join('') ?? '';
    return Math.ceil(s.length / 4.0);
  }
}
