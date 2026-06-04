// DiagTracer — diagnostics interceptor with full insight engine integration.
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import vscode from 'vscode';
import type { Interceptor } from '../mesh/pipeline';
import { insight } from './insight-engine';

let _channel: vscode.LogOutputChannel | undefined;
function ch(): vscode.LogOutputChannel {
  if (!_channel) _channel = vscode.window.createOutputChannel('Copilot Adapter Kit', { log: true });
  return _channel;
}

export { ch as logger };

export class DiagTracer implements Interceptor {
  private charsPerToken = 4.0;
  private dumpRoot: string | undefined;

  constructor(private ext?: vscode.ExtensionContext) {}

  info(msg: string): void { ch().info(msg); }

  calibrate(tokens: number, totalChars: number): void {
    if (tokens > 0 && totalChars > 0) this.charsPerToken = totalChars / tokens;
  }

  get ratio(): number { return this.charsPerToken; }

  async openDumpsFolder(): Promise<void> {
    const root = await this._ensureDumpRoot();
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(root));
    vscode.window.showInformationMessage(`Dumps: ${root}`);
  }

  async intercept(
    payload: any, _engine: any, sink: any, _signal: any, next: () => Promise<void>
  ): Promise<void> {
    const hash = createHash('sha256').update(JSON.stringify(payload.messages?.slice(-2))).digest('hex').slice(0, 8);

    // Build fingerprint and diff with previous request
    const print = insight.fingerprint(payload);
    const diff = insight.diff(insight.last, print);
    insight.commit(print);

    ch().info(`[req ${hash}] model=${payload.model} msgs=${payload.messages?.length} tools=${payload.tools?.length ?? 0}`);
    if (payload._visionFallback) {
      ch().info(`[req ${hash}] vision-fallback → ${payload._visionFallback.family}:${payload._visionFallback.model}`);
    }
    if (diff) {
      ch().info(`[req ${hash}] ${diff.summaryLine}`);
      for (const line of diff.detailLines) ch().info(`[req ${hash}] detail: ${line}`);
      for (const alert of diff.alerts) ch().warn(`[req ${hash}] alert: ${alert}`);
    }
    const start = Date.now();

    const origComplete = sink.onComplete;
    const origFault = sink.onFault;
    const origReport = sink.onReport;

    if (origReport) {
      sink.onReport = (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => {
        this.calibrate(usage.total_tokens, JSON.stringify(payload.messages).length);
        origReport(usage);
      };
    }

    sink.onComplete = () => {
      ch().info(`[req ${hash}] ok ${Date.now() - start}ms`);
      if (config.get<string>('logLevel') === 'dump') {
        this._writeDump(hash, { response: 'ok', elapsedMs: Date.now() - start }).catch(() => {});
      }
      origComplete();
    };
    sink.onFault = async (e: Error) => {
      ch().error(`[req ${hash}] fault [${(e as any).status ?? '?'}] ${e.message}`);
      if (config.get<string>('logLevel') === 'dump') {
        this._writeDump(hash, {
          error: { message: e.message, status: (e as any).status, code: (e as any).code, raw: (e as any).raw, stack: e.stack },
          elapsedMs: Date.now() - start,
        }).catch(() => {});
      }
      await origFault(e);
    };

    const config = vscode.workspace.getConfiguration('copilot-adapter-kit');
    if (config.get<string>('logLevel') === 'dump') {
      const dumpData: any = { payload, tools: payload.tools };
      // Audit: include vision fallback metadata if present
      if (payload._visionFallback) {
        dumpData._visionFallback = payload._visionFallback;
      }
      this._writeDump(hash, dumpData).catch(() => {});
    }

    await next();
  }

  private async _ensureDumpRoot(): Promise<string> {
    if (!this.dumpRoot) {
      this.dumpRoot = join(tmpdir(), 'copilot-adapter-kit-dumps');
      await mkdir(this.dumpRoot, { recursive: true });
    }
    return this.dumpRoot;
  }

  private async _writeDump(hash: string, data: any): Promise<void> {
    const root = await this._ensureDumpRoot();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(root, `req-${ts}-${hash}.json`);
    await writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
    // Write system prompt separately if this is a request dump
    const sysMsg = data.payload?.messages?.[0];
    if (sysMsg?.content) {
      const sysFile = join(root, `req-${ts}-${hash}.sys.txt`);
      await writeFile(sysFile, typeof sysMsg.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg.content), 'utf-8');
    }
    // Write tools separately if present
    if (data.tools?.length) {
      const toolsFile = join(root, `req-${ts}-${hash}.tools.json`);
      await writeFile(toolsFile, JSON.stringify(data.tools, null, 2), 'utf-8');
    }
    // Write error separately if present
    if (data.error) {
      const errFile = join(root, `req-${ts}-${hash}.error.json`);
      await writeFile(errFile, JSON.stringify(data.error, null, 2), 'utf-8');
    }
    // Write vision fallback audit separately
    if (data._visionFallback) {
      const vfFile = join(root, `req-${ts}-${hash}.vision-fallback.json`);
      await writeFile(vfFile, JSON.stringify(data._visionFallback, null, 2), 'utf-8');
    }
  }
}
