// The status bar item and its hover.
//
// What a MarkdownString hover can actually do, which is less than it looks:
// paragraphs, bold, links, codicons, inline code, and tables that SHRINK TO FIT
// their content. It cannot set a font size, a width, or any padding, and raw
// HTML is stripped by the sanitiser — so <sub>, <span style> and friends are
// silently dropped rather than honoured.
//
// Two consequences drive the layout below. Every row lives in ONE table, because
// separate tables shrink independently and nothing lines up between them. And
// alignment only exists relative to the widest row in that table, so the title
// row is what sets the column — everything else right-aligns to it.
//
// Copilot's own status menu is not this. It is rendered by VS Code for
// first-party quota UI, with real progress tracks and type sizes no extension
// can reach. The rich version of this lives in the Spend Guard panel; the hover
// is a glance, and is built to be a good glance rather than a poor imitation.

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

/** One `| left | right |` pair. Empty pairs are spacing rows. */
type Row = [string, string];

export function buildTooltip(s: BudgetStatus): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = true;
  md.isTrusted = true;     // the links below run commands

  const used = s.day.inputTokens + s.day.outputTokens;
  const rows: Row[] = [];

  // The title row is the widest, so it sets where the right column sits.
  rows.push([
    '**Copilot Adapter Kit**',
    `[$(gear) Settings](command:copilot-adapter-kit.openPanel)`
    + `&nbsp;&nbsp;[$(graph) Spend Guard](command:copilot-adapter-kit.showUsage)`,
  ]);

  if (!s.caps.enforce) {
    rows.push(['', '']);
    rows.push([
      '$(alert) **Spend guard is off**',
      '[Turn it back on](command:copilot-adapter-kit.enableSpendGuard)',
    ]);
  }

  rows.push(['', '']);
  _budget(rows, 'Tokens',
    s.caps.dailyTokenLimit > 0 ? s.tokenPct : -1,
    _fmt(used),
    s.caps.dailyTokenLimit > 0 ? _fmt(s.caps.dailyTokenLimit) : '',
    s.day.hourly);
  _budget(rows, 'Cost',
    s.caps.dailyCostLimitUsd > 0 ? s.costPct : -1,
    `$${s.day.costUsd.toFixed(2)}`,
    s.caps.dailyCostLimitUsd > 0 ? `$${s.caps.dailyCostLimitUsd.toFixed(2)}` : '',
    s.day.hourlyCost);

  rows.push(['', '']);
  rows.push(['Requests', String(s.day.requests)]);
  if (s.day.blocked > 0) rows.push(['Blocked', `$(circle-slash) ${s.day.blocked}`]);

  const top = Object.entries(s.day.byModel)
    .sort((a, b) => (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens))[0];
  if (top) rows.push(['Busiest model', _cell(top[0])]);

  rows.push(['Guard', s.caps.enforce
    ? (s.overLimit ? '$(error) Blocking' : '$(shield) Protected')
    : '$(alert) Off']);
  rows.push(['Resets', _resetsIn()]);

  rows.push(['', '']);
  rows.push([`[Reset today's counters](command:copilot-adapter-kit.resetBudget)`, '']);

  md.appendMarkdown(`| | |\n|:--|--:|\n`);
  for (const [l, r] of rows) md.appendMarkdown(`| ${l} | ${r} |\n`);

  if (s.day.estimated) {
    md.appendMarkdown(`\n$(info) Some figures are estimates — a provider reported no usage.`);
  }
  return md;
}

/**
 * A budget, as one or two rows.
 *
 * With usage: the figures sit beside the label, and the day's shape gets its own
 * row with the percentage and the busiest hour opposite it. The sparkline is the
 * real hourly series rather than a fill of the percentage — a bar that is 74%
 * full repeats the number printed next to it, whereas the shape says whether it
 * crept up all day or arrived in one burst at 3am, which is the whole reason the
 * guard exists.
 */
function _budget(
  rows: Row[], label: string, pct: number,
  spent: string, limit: string, series: number[],
): void {
  // An uncapped budget has no percentage to report, so the figures row has to
  // say so — otherwise a bare number reads as a limit nobody set.
  const figures = limit ? `${spent} of ${limit}` : `${spent} · no limit`;
  rows.push([`**${label}**`, figures]);

  // Nothing has run: a flat line along the bottom would read as data.
  const spark = _sparkline(series);
  if (!spark) return;

  const pctText = pct < 0 ? 'uncapped' : `${Math.round(pct)}%`;
  rows.push([`\`${spark}\``, `${pctText}${_peak(series)}`]);
}

/** Eight levels of block, one cell per hour elapsed. */
const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function _sparkline(series: number[]): string {
  if (!Array.isArray(series) || series.length === 0) return '';
  // Only as far as the day has got — trailing zeros would read as a long quiet
  // spell rather than hours that have not happened.
  const upto = Math.min(series.length - 1, new Date().getHours());
  const window = series.slice(0, upto + 1);
  const max = Math.max(...window);
  if (max <= 0) return '';
  return window
    .map(v => SPARK[Math.min(SPARK.length - 1, Math.max(0, Math.round((v / max) * (SPARK.length - 1))))])
    .join('');
}

/** The hour that took the most, which is the question a spike raises. */
function _peak(series: number[]): string {
  const upto = Math.min(series.length - 1, new Date().getHours());
  let hour = -1, max = 0;
  for (let h = 0; h <= upto; h++) {
    if ((series[h] ?? 0) > max) { max = series[h]; hour = h; }
  }
  return hour < 0 ? '' : ` · peak ${String(hour).padStart(2, '0')}:00`;
}

/** Time left in the day, which is more use than the wall-clock midnight. */
function _resetsIn(): string {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((midnight.getTime() - Date.now()) / 60_000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `in ${h}h ${mins % 60}m` : `in ${mins}m`;
}

/** A pipe inside a cell would end the column early. */
function _cell(text: string): string {
  return text.replace(/\|/g, '\\|').slice(0, 40);
}

function _fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
