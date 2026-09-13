// SpendGuardPanel — the dashboard that replaced the native modal.
//
// A budget is something you watch, not something you acknowledge. The modal
// could not render a number larger than its font size, could not stay open
// while an agent ran, and blocked the window while it asked. This panel sits in
// a split and updates live as the ledger moves.

import vscode from 'vscode';
import type { Context } from '../kernel/context';
import { WebviewHost } from './webview-host';

export class SpendGuardPanel {
  static current: SpendGuardPanel | undefined;

  private panel: vscode.WebviewPanel;
  private host: WebviewHost;
  private disposables: vscode.Disposable[] = [];

  static show(ext: vscode.ExtensionContext, ctx: Context): void {
    if (SpendGuardPanel.current) {
      SpendGuardPanel.current.panel.reveal();
      void SpendGuardPanel.current._send();
      return;
    }
    SpendGuardPanel.current = new SpendGuardPanel(ext, ctx);
  }

  private constructor(ext: vscode.ExtensionContext, private ctx: Context) {
    this.host = new WebviewHost(ext);
    this.panel = vscode.window.createWebviewPanel(
      'cak.spendGuard',
      'Spend Guard',
      vscode.ViewColumn.Active,
      this.host.options,
    );

    try {
      this.panel.webview.html = this.host.html(this.panel.webview, 'spendGuard');
    } catch (e) {
      void vscode.window.showErrorMessage((e as Error).message);
      this.panel.dispose();
      return;
    }

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(msg => void this._handle(msg)),
      // The ledger moves while the panel is open; the curve should follow.
      ctx.budget.onChange(() => void this._send()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('copilot-adapter-kit.budget')) void this._send();
      }),
    );

    this.panel.onDidDispose(() => {
      SpendGuardPanel.current = undefined;
      for (const d of this.disposables) d.dispose();
      this.disposables = [];
    });
  }

  private async _handle(msg: { type: string; payload?: any }): Promise<void> {
    switch (msg.type) {
      case 'getState':
        await this._send();
        break;
      case 'saveConfig':
        await vscode.workspace.getConfiguration('copilot-adapter-kit')
          .update(msg.payload?.key, msg.payload?.value, vscode.ConfigurationTarget.Global);
        await this._send();
        break;
      case 'resetBudget':
        await vscode.commands.executeCommand('copilot-adapter-kit.resetBudget');
        await this._send();
        break;
      case 'setBudgetGuard':
        await vscode.commands.executeCommand(
          msg.payload?.on
            ? 'copilot-adapter-kit.enableSpendGuard'
            : 'copilot-adapter-kit.disableSpendGuard',
        );
        await this._send();
        break;
      case 'openSettings':
        await vscode.commands.executeCommand(
          'workbench.action.openSettings', 'copilot-adapter-kit.budget');
        break;
    }
  }

  private async _send(): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'state',
      payload: { budget: this.ctx.budget.status() },
    });
  }
}
