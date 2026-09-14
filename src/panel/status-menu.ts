// The status menu — what opens when the status bar item is clicked.
//
// Copilot's equivalent is not a hover, and neither is this. A QuickPick is
// rendered by VS Code itself, which is where the things a MarkdownString cannot
// have come from: real padding, a row height, hover and keyboard focus,
// separators that span the width, per-row buttons, and a filter. It is the
// closest a third-party extension gets to the panel Copilot shows for its own
// quota, and it looks native because it is.
//
// The hover stays a glance. This is the menu. The dashboard is one step further
// in, for when the shape of the day is not enough.

import vscode from 'vscode';
import type { BudgetStatus } from '../kernel/budget';
import type { Context } from '../kernel/context';
import { insertUiAudit } from '../storage/db';
import { clockHour, fmtCompact, peakHour, resetsIn, sparkline } from './spark';

interface Item extends vscode.QuickPickItem {
  /** What picking the row does. Rows without one are read-only readouts. */
  run?: () => void | Thenable<void>;
}

const SEP = { label: '', kind: vscode.QuickPickItemKind.Separator } as Item;

const DASHBOARD_BTN: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('graph'),
  tooltip: 'Open the Spend Guard dashboard',
};
const SETTINGS_BTN: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('settings-gear'),
  tooltip: 'Open settings',
};

export function showStatusMenu(ctx: Context): void {
  const qp = vscode.window.createQuickPick<Item>();
  qp.title = 'Copilot Adapter Kit';
  qp.placeholder = 'Spend, limits and where to change them';
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.buttons = [DASHBOARD_BTN, SETTINGS_BTN];
  qp.items = _items(ctx.budget.status());

  // The ledger moves while the menu is open; an agent mid-run should be visible
  // in it rather than frozen at whatever the figures were when it opened.
  const live = ctx.budget.onChange(s => { qp.items = _items(s); });

  qp.onDidTriggerButton(b => {
    qp.hide();
    void vscode.commands.executeCommand(b === SETTINGS_BTN
      ? 'copilot-adapter-kit.openPanel'
      : 'copilot-adapter-kit.showUsage');
  });

  qp.onDidAccept(() => {
    const picked = qp.selectedItems[0];
    if (!picked?.run) return;      // a readout row: picking it does nothing
    qp.hide();
    void picked.run();
  });

  qp.onDidHide(() => { live.dispose(); qp.dispose(); });
  insertUiAudit({ event_type: 'statusbar.menu', module: 'status', action: 'open' });
  qp.show();
}

function _items(s: BudgetStatus): Item[] {
  const items: Item[] = [];
  const used = s.day.inputTokens + s.day.outputTokens;

  // An unguarded session is the first thing in the list, not a footnote.
  if (!s.caps.enforce) {
    items.push({ ...SEP, label: 'Unprotected' });
    items.push({
      label: '$(alert) Spend guard is off',
      description: 'requests are uncapped',
      detail: 'Nothing stops a loop from running up provider charges. Pick to turn it back on.',
      run: () => vscode.commands.executeCommand('copilot-adapter-kit.enableSpendGuard'),
    });
  }

  items.push({ ...SEP, label: `Today · resets ${resetsIn()}` });
  items.push(_budget('symbol-numeric', 'Tokens',
    s.caps.dailyTokenLimit > 0 ? s.tokenPct : -1,
    fmtCompact(used),
    s.caps.dailyTokenLimit > 0 ? fmtCompact(s.caps.dailyTokenLimit) : '',
    s.day.hourly));
  items.push(_budget('credit-card', 'Cost',
    s.caps.dailyCostLimitUsd > 0 ? s.costPct : -1,
    `$${s.day.costUsd.toFixed(2)}`,
    s.caps.dailyCostLimitUsd > 0 ? `$${s.caps.dailyCostLimitUsd.toFixed(2)}` : '',
    s.day.hourlyCost));

  items.push({ ...SEP, label: 'Activity' });
  items.push({
    label: '$(arrow-swap) Requests',
    description: String(s.day.requests),
    detail: _modelLine(s),
  });
  if (s.day.blocked > 0) {
    const last = s.day.refusals[0];
    items.push({
      label: '$(circle-slash) Refused',
      description: String(s.day.blocked),
      detail: last?.reason ? `Most recent: ${last.reason}` : 'Requests stopped before reaching a provider.',
      run: () => vscode.commands.executeCommand('copilot-adapter-kit.showUsage'),
    });
  }
  items.push({
    label: s.caps.enforce
      ? (s.overLimit ? '$(error) Guard' : '$(shield) Guard')
      : '$(alert) Guard',
    description: s.caps.enforce ? (s.overLimit ? 'blocking' : 'protected') : 'off',
    detail: s.caps.enforce
      ? `Refuses a request that would pass a cap. Output is capped at ${fmtCompact(s.caps.maxOutputTokens || 16_384)} tokens a turn.`
      : 'No cap is applied to anything.',
    run: () => vscode.commands.executeCommand('copilot-adapter-kit.showUsage'),
  });

  items.push({ ...SEP, label: 'Open' });
  items.push({
    label: '$(graph) Spend Guard',
    detail: 'The burn curve against the ceiling, fourteen weeks of history, and the limits',
    run: () => vscode.commands.executeCommand('copilot-adapter-kit.showUsage'),
  });
  items.push({
    label: '$(settings-gear) Settings',
    detail: 'Providers, models, API keys, audit log',
    run: () => vscode.commands.executeCommand('copilot-adapter-kit.openPanel'),
  });
  items.push({
    label: '$(history) Reset today’s counters',
    detail: 'Clears the figures above. The audit log is not touched.',
    run: () => vscode.commands.executeCommand('copilot-adapter-kit.resetBudget'),
  });

  return items;
}

/**
 * A budget as one row: the figures beside the label, the day's shape underneath.
 *
 * The sparkline goes in `detail` rather than the label because that second line
 * is where VS Code gives a row room to breathe, and because the shape is the
 * part worth looking at twice.
 */
function _budget(
  icon: string, label: string, pct: number,
  spent: string, limit: string, series: number[],
): Item {
  const spark = sparkline(series);
  const peak = peakHour(series);
  const headline = pct < 0 ? 'no limit set' : `${Math.round(pct)}% used`;

  return {
    label: `$(${icon}) ${label}`,
    description: limit ? `${spent} of ${limit} · ${headline}` : `${spent} · ${headline}`,
    detail: spark
      ? `${spark}  00:00 → now${peak >= 0 ? `, busiest at ${clockHour(peak)}` : ''}`
      : 'Nothing spent yet today',
    run: () => vscode.commands.executeCommand('copilot-adapter-kit.showUsage'),
  };
}

function _modelLine(s: BudgetStatus): string {
  const models = Object.entries(s.day.byModel)
    .sort((a, b) => (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens));
  if (models.length === 0) return 'No model has been called today';
  const [name, m] = models[0];
  const share = models.length > 1 ? ` of ${models.length} models` : '';
  return `Busiest${share}: ${name}, ${fmtCompact(m.inputTokens + m.outputTokens)} tokens`;
}
