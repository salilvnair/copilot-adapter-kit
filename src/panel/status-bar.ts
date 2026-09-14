// The status bar item and its hover.
//
// Shaped after Copilot's own: the mark alone until there is something to say, a
// percentage once there is, and a hover carrying a bar per budget with when it
// resets — rather than a paragraph of text.

import vscode from 'vscode';
import type { BudgetStatus } from '../kernel/budget';

export function paintStatus(item: vscode.StatusBarItem, s: BudgetStatus): void {
  const used = s.day.inputTokens + s.day.outputTokens;
  const pct = Math.max(s.tokenPct, s.costPct);

  if (!s.caps.enforce) {
    item.text = '$(cak-icon) $(alert) Uncapped';
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (s.overLimit) {
    item.text = '$(cak-icon) Blocking';
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else {
    // Just the mark until there is something to report, the way Copilot's own
    // item behaves. A bare "0" beside an icon reads as a defect, not a figure.
    item.text = used > 0 && pct >= 0
      ? `$(cak-icon) ${Math.round(pct)}%`
      : '$(cak-icon)';
    item.backgroundColor = s.nearLimit
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  }

  item.tooltip = buildTooltip(s);
}

/**
 * The hover, in the shape Copilot uses for its own: a title with an action, a
 * percentage and a bar per budget, when it resets, then the rows underneath.
 */
export function buildTooltip(s: BudgetStatus): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = true;
  md.isTrusted = true;     // the links below run commands

  const used = s.day.inputTokens + s.day.outputTokens;
  const tokenPct = s.caps.dailyTokenLimit > 0 ? Math.min(999, s.tokenPct) : -1;
  const costPct = s.caps.dailyCostLimitUsd > 0 ? Math.min(999, s.costPct) : -1;

  md.appendMarkdown(`| | |
|:--|--:|
`);
  md.appendMarkdown(
    `| **Copilot Adapter Kit** `
    + `| [$(gear) Settings](command:copilot-adapter-kit.openPanel) `
    + `&nbsp; [$(graph) Spend Guard](command:copilot-adapter-kit.showUsage) |

`,
  );

  if (!s.caps.enforce) {
    md.appendMarkdown(`$(alert) **Spend guard is off.** Requests are unlimited.

`);
    md.appendMarkdown(`[Re-enable protection](command:copilot-adapter-kit.enableSpendGuard)

---

`);
  }

  _meter(md, 'Tokens', tokenPct, `${_fmt(used)}${s.caps.dailyTokenLimit > 0 ? ` of ${_fmt(s.caps.dailyTokenLimit)}` : ''}`, _resetsAt());
  _meter(md, 'Cost', costPct, `$${s.day.costUsd.toFixed(2)}${s.caps.dailyCostLimitUsd > 0 ? ` of $${s.caps.dailyCostLimitUsd.toFixed(2)}` : ''}`);

  md.appendMarkdown(`---

| | |
|:--|--:|
`);
  md.appendMarkdown(`| Requests | ${s.day.requests} |
`);
  if (s.day.blocked > 0) {
    md.appendMarkdown(`| Blocked | $(circle-slash) ${s.day.blocked} |
`);
  }
  const top = Object.entries(s.day.byModel)
    .sort((a, b) => (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens))[0];
  if (top) {
    md.appendMarkdown(`| Busiest model | ${top[0]} |
`);
  }
  md.appendMarkdown(
    `| Guard | ${s.caps.enforce
      ? (s.overLimit ? '$(error) Blocking' : '$(shield) Protected')
      : '$(alert) Off'} |

`,
  );

  if (s.day.estimated) {
    md.appendMarkdown(`$(info) Some figures are estimates — a provider reported no usage.

`);
  }
  md.appendMarkdown(`[Reset today's counters](command:copilot-adapter-kit.resetBudget)`);

  return md;
}

/** A labelled percentage with a bar, the way the Copilot hover reads. */
function _meter(md: vscode.MarkdownString, label: string, pct: number, detail: string, note?: string): void {
  if (pct < 0) {
    md.appendMarkdown(`**${label}** &nbsp; \`no limit\`

${detail}

`);
    return;
  }
  const filled = Math.max(0, Math.min(20, Math.round((pct / 100) * 20)));
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  md.appendMarkdown(`| | |
|:--|--:|
| **${label}** | ${note ?? ''} |

`);
  md.appendMarkdown(`**${Math.round(pct)}%** used &nbsp; &nbsp; ${detail}

`);
  md.appendMarkdown(`\`${bar}\`

`);
}

/** Local midnight, phrased the way Copilot phrases its own reset. */
function _resetsAt(): string {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return `Resets ${midnight.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })}`;
}

function _fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

