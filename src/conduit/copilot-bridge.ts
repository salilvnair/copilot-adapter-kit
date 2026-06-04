// CopilotBridge — sole entry point VS Code Copilot sees.
// Resolves model → family → provider config + key → engine.
import vscode from 'vscode';
import { stabilizeToolFlow } from '../crosscut/tool-stabilizer';
import { Context } from '../kernel/context';
import { Payload, ToolSignal } from '../mesh/contract';
import { forgeEnvelopes, forgeTools } from '../mesh/engines/openai/openai-wire-format';
import { metaToVscode, resolveCatalog } from './model-catalog';
import type { ThoughtStash } from './replay';
import { packStash, shouldStash } from './replay';

export class CopilotBridge implements vscode.LanguageModelChatProvider {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.emitter.event;
  private alive = true;

  constructor(private ctx: Context) {}

  signal(): void { this.emitter.fire(); }

  async provideLanguageModelChatInformation(): Promise<vscode.LanguageModelChatInformation[]> {
    if (!this.alive) return [];
    const ready = await this.ctx.vault.present();
    return resolveCatalog().map(m => metaToVscode(m, ready));
  }

  async provideLanguageModelChatResponse(
    info: vscode.LanguageModelChatInformation,
    msgs: readonly vscode.LanguageModelChatRequestMessage[],
    opts: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const meta = resolveCatalog().find(m => m.id === info.id);
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

    // Inject custom system/user prompts if configured
    let augmentedMsgs = resolvedMsgs;
    const systemPrompt = this.ctx.tuning.systemPrompt;
    const userTemplate = this.ctx.tuning.userPromptTemplate;
    if (systemPrompt || userTemplate) {
      augmentedMsgs = this._applyPromptTemplates(resolvedMsgs, systemPrompt, userTemplate, modelId);
    }

    // Vision fallback: preprocess image parts through a vision-capable model when configured.
    let finalMsgs = augmentedMsgs;
    let visionFallbackUsed: { model: string; family: string } | undefined;
    const hasImages = this._hasImageParts(augmentedMsgs);
    const modelSupportsImages = meta?.image ?? true;
    const vfModel = meta?.visionFallback || this.ctx.tuning.visionFallbackModel;
    const shouldFallback = Boolean(vfModel) && hasImages &&
      (this.ctx.tuning.visionFallbackAlways || !modelSupportsImages);
    if (shouldFallback && vfModel) {
      const colonIdx = vfModel.indexOf(':');
      visionFallbackUsed = colonIdx > 0
        ? { model: vfModel.slice(colonIdx + 1), family: vfModel.slice(0, colonIdx) }
        : { model: vfModel, family: resolveCatalog().find(m => m.id === vfModel)?.family || 'copilot' };
      finalMsgs = await this._applyVisionFallback(augmentedMsgs, vfModel, token);
    }

    const payload: Payload = {
      model: modelId,
      messages: forgeEnvelopes(finalMsgs, shouldFallback ? false : modelSupportsImages, meta?.thinking === true),
      stream: true,
      tools: forgeTools(opts.tools),
      tool_choice: opts.tools?.length ? 'auto' : undefined,
      max_tokens: this.ctx.tuning.maxTokens,
      apiPath: meta?.apiPath || this.ctx.tuning.resolveApiPath(info.id, family),
      // Audit trail: vision fallback metadata for dump logs
      ...(visionFallbackUsed ? { _visionFallback: visionFallbackUsed } : {}),
    };

    const wrapped = this.ctx.pipeline.wrap(engine);
    const ctrl = new AbortController();
    const disp = token.onCancellationRequested(() => ctrl.abort());
    if (token.isCancellationRequested) { ctrl.abort(); disp.dispose(); return; }

    try {
      const emitted = new Set<string>();
      let thoughtBuf = '';
      const isThinker = meta?.thinking === true;
      await wrapped.stream(payload, {
        onToken: t => progress.report(new vscode.LanguageModelTextPart(t)),
        onThinking: t => {
          if (isThinker) thoughtBuf += t;
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
        onComplete: () => {
          // Stash chain-of-thought for replay on next turn
          if (isThinker) {
            const stash: ThoughtStash = { chain: thoughtBuf };
            if (shouldStash(stash)) {
              progress.report(packStash(stash));
            }
          }
        },
      }, ctrl.signal);
    } finally { disp.dispose(); }
  }

  /** Route images through a vision-capable model and replace with text descriptions.
   * When vfModel starts with "copilot:", routes through the native Copilot vscode.lm API.
   * Otherwise routes through the configured CAK engine for that family. */
  private async _applyVisionFallback(
    msgs: readonly vscode.LanguageModelChatRequestMessage[],
    vfModel: string,
    token: vscode.CancellationToken,
  ): Promise<readonly vscode.LanguageModelChatRequestMessage[]> {
    const colonIdx = vfModel.indexOf(':');
    const vfFamily = colonIdx > 0 ? vfModel.slice(0, colonIdx) : 'openai';
    const vfModelId = colonIdx > 0 ? vfModel.slice(colonIdx + 1) : vfModel;

    const result = [...msgs];
    for (let i = 0; i < result.length; i++) {
      const msg = result[i];
      const parts = [...msg.content];
      const imageParts: vscode.LanguageModelDataPart[] = [];
      const textParts: vscode.LanguageModelTextPart[] = [];
      for (const p of parts) {
        if (p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/')) {
          imageParts.push(p);
        } else if (p instanceof vscode.LanguageModelTextPart) {
          textParts.push(p);
        }
      }
      if (!imageParts.length) continue;

      const descriptions: string[] = [];
      for (const img of imageParts) {
        try {
          const desc = vfFamily === 'copilot'
            ? await this._describeViaCopilot(vfModelId, img, token)
            : await this._describeViaEngine(vfFamily, vfModelId, img, token);
          descriptions.push(desc);
        } catch {
          descriptions.push('[image — vision fallback failed]');
        }
      }

      const newContent: (vscode.LanguageModelTextPart)[] = [
        ...textParts,
        new vscode.LanguageModelTextPart(
          `\n\n[Image${imageParts.length > 1 ? 's' : ''} described by vision provider: ${descriptions.join(' | ')}]\n\n`
        ),
      ];
      result[i] = { role: msg.role, name: undefined, content: newContent } as vscode.LanguageModelChatRequestMessage;
    }
    return result;
  }

  /** Describe an image using Copilot's native model API (vscode.lm). */
  private async _describeViaCopilot(
    modelId: string, img: vscode.LanguageModelDataPart, token: vscode.CancellationToken,
  ): Promise<string> {
    const models = await vscode.lm.selectChatModels({});
    const copilotModels = models.filter(m => {
      const v = (m as any).vendor;
      return v === 'copilot' || v === 'github-copilot' || m.family === 'copilot' || m.family === 'github-copilot';
    });
    const model = copilotModels.find(m => m.id === modelId || m.family === modelId || m.name.toLowerCase() === modelId.toLowerCase())
      || (modelId === 'auto' ? copilotModels.find(m => m.name.toLowerCase().includes('auto')) || copilotModels[0] : undefined);
    if (!model) throw new Error(`Copilot model "${modelId}" not found`);

    const msgs: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User('Describe this image in detail. Focus on what is visible — text, UI elements, code, diagrams, layout. Be concise but thorough.'),
      vscode.LanguageModelChatMessage.User([img]),
    ];
    const resp = await model.sendRequest(msgs, {}, token);
    let text = '';
    for await (const chunk of resp.text) { text += chunk; }
    return text;
  }

  private _hasImageParts(msgs: readonly vscode.LanguageModelChatRequestMessage[]): boolean {
    for (const msg of msgs) {
      for (const p of msg.content) {
        if (p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/')) return true;
      }
    }
    return false;
  }

  /** Describe an image using a CAK-configured engine. */
  private async _describeViaEngine(
    family: string, modelId: string, img: vscode.LanguageModelDataPart, token: vscode.CancellationToken,
  ): Promise<string> {
    const p = this.ctx.tuning.provider(family);
    if (!p.baseUrl) throw new Error(`No baseUrl for "${family}"`);
    const key = await this.ctx.vault.fetch(family);
    const engine = this.ctx.discovery.lookup(family);
    engine.configure?.(p.baseUrl, key || '');

    const visionMsg: vscode.LanguageModelChatRequestMessage = {
      role: vscode.LanguageModelChatMessageRole.User,
      name: undefined,
      content: [
        new vscode.LanguageModelTextPart('Describe this image in detail. Focus on what is visible — text, UI elements, code, diagrams, layout. Be concise but thorough.'),
        img,
      ],
    };
    const visionPayload: Payload = {
      model: modelId,
      messages: forgeEnvelopes([visionMsg], true),
      stream: false,
      max_tokens: 1024,
    };
    return this._fetchNonStreamed(engine, visionPayload, token);
  }

  private async _fetchNonStreamed(
    engine: { stream(req: Payload, sink: any, signal?: AbortSignal): Promise<void> },
    payload: Payload,
    token: vscode.CancellationToken,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let result = '';
      engine.stream(payload, {
        onToken: (t: string) => { result += t; },
        onComplete: () => resolve(result),
        onFault: (e: Error) => reject(e),
      }, token.isCancellationRequested ? undefined : undefined).catch(reject);
    });
  }

  /** Apply custom system prompt and/or user message template.
   * Injects a system message and wraps user messages if templates are configured. */
  private _applyPromptTemplates(
    msgs: readonly vscode.LanguageModelChatRequestMessage[],
    systemPrompt: string,
    userTemplate: string,
    modelId: string,
  ): readonly vscode.LanguageModelChatRequestMessage[] {
    const result: vscode.LanguageModelChatRequestMessage[] = [];

    // Build system prompt with placeholders filled
    if (systemPrompt) {
      const filled = systemPrompt
        .replace(/\{model\}/g, modelId)
        .replace(/\{date\}/g, new Date().toISOString().slice(0, 10))
        .replace(/\{tools\}/g, 'See function definitions below.')
        .replace(/\{cakVersion\}/g, '1.0.0');
      result.push({
        role: vscode.LanguageModelChatMessageRole.User,
        name: undefined,
        content: [new vscode.LanguageModelTextPart(filled)],
      } as vscode.LanguageModelChatRequestMessage);
    }

    for (const msg of msgs) {
      if (userTemplate && msg.role === vscode.LanguageModelChatMessageRole.User) {
        // Extract text parts and wrap them
        const textParts: string[] = [];
        const nonTextParts: any[] = [];
        for (const part of msg.content) {
          if (part instanceof vscode.LanguageModelTextPart) {
            textParts.push(part.value);
          } else {
            nonTextParts.push(part);
          }
        }
        if (textParts.length > 0) {
          const wrapped = userTemplate.replace(/\{userMessage\}/g, textParts.join('\n'));
          result.push({
            role: msg.role,
            name: undefined,
            content: [new vscode.LanguageModelTextPart(wrapped), ...nonTextParts],
          } as vscode.LanguageModelChatRequestMessage);
          continue;
        }
      }
      result.push(msg);
    }
    return result;
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
