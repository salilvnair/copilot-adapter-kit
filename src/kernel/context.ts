// ApplicationContext — IoC container. Every service resolves from here.
import vscode from 'vscode';
import { CopilotBridge } from '../conduit/copilot-bridge';
import { DiagTracer } from '../crosscut/diag-tracer';
import { ErrorWarden } from '../crosscut/error-warden';
import { RateLimitGuard } from '../crosscut/rate-limit-guard';
import { ProviderDiscovery } from '../mesh/discovery';
import { InterceptorPipeline } from '../mesh/pipeline';
import { Tuning } from './tuning';
import { Vault } from './vault';

export class Context {
  readonly vault: Vault;
  readonly tuning: Tuning;
  readonly discovery: ProviderDiscovery;
  readonly pipeline: InterceptorPipeline;
  readonly bridge: CopilotBridge;
  readonly rateLimitGuard: RateLimitGuard;
  readonly errorWarden: ErrorWarden;
  readonly tracer: DiagTracer;

  private constructor(readonly ext: vscode.ExtensionContext) {
    this.vault    = new Vault(ext.secrets);
    this.tuning   = new Tuning();
    this.discovery = new ProviderDiscovery();
    this.pipeline  = new InterceptorPipeline();
    this.rateLimitGuard = new RateLimitGuard();
    this.errorWarden   = new ErrorWarden();
    this.tracer    = new DiagTracer(ext);
    this.bridge    = new CopilotBridge(this);
  }

  static async bootstrap(ext: vscode.ExtensionContext): Promise<Context> {
    const ctx = new Context(ext);
    ctx.pipeline.use(ctx.rateLimitGuard);
    ctx.pipeline.use(ctx.errorWarden);
    ctx.pipeline.use(ctx.tracer);

    ext.subscriptions.push(
      vscode.lm.registerLanguageModelChatProvider('copilot-adapter-kit', ctx.bridge),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('copilot-adapter-kit')) ctx.bridge.signal();
      }),
      ext.secrets.onDidChange(e => {
        if (e.key.startsWith('copilot-adapter-kit.apiKey')) ctx.bridge.signal();
      }),
    );

    // Defer signal so VS Code has time to register the provider before we
    // announce model availability. Without this, models only appear after
    // the user manually triggers a config change or clicks the status bar.
    setTimeout(() => ctx.bridge.signal(), 100);

    ctx.tracer.info(`copilot-adapter-kit online — ${ctx.discovery.count()} engine(s) registered`);
    return ctx;
  }
}
