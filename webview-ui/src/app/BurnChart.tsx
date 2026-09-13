/* The cumulative burn curve.
 *
 * A bar chart of hourly usage shows activity. A cumulative curve against a
 * fixed ceiling shows trajectory — at 03:00 you can see the line is aimed at
 * the cap hours before it gets there, which is the one view that lets someone
 * catch an overnight run while it is still running.
 *
 * The dashed line is the same day without the guard: what would have been spent
 * had nothing refused anything. */

import { Card } from '../ui';
import { fmtTokens } from './state';

const W = 720, H = 180;
const L = 44, R = 12, T = 14, B = 26;
const PLOT_W = W - L - R;
const PLOT_H = H - T - B;

export function BurnChart({
  hourly, ceiling, enforced,
}: {
  hourly: number[];
  ceiling: number;
  enforced: boolean;
}) {
  const hours = hourly.length === 24 ? hourly : new Array(24).fill(0);
  const nowHour = new Date().getHours();

  // Cumulative, and cumulative-as-if-nothing-had-been-refused. Without a guard
  // the two are identical, so only one line is drawn.
  const guarded: number[] = [];
  let run = 0;
  for (const h of hours) { run += h; guarded.push(run); }

  const spent = guarded[guarded.length - 1] ?? 0;
  const hasCeiling = ceiling > 0;
  const top = Math.max(spent, hasCeiling ? ceiling * 1.15 : 0, 1);

  const x = (i: number) => L + (i / 23) * PLOT_W;
  const y = (v: number) => T + PLOT_H - (v / top) * PLOT_H;

  // Draw as far as the day has got — or as far as there is data, whichever is
  // later. They differ if the clock moved, and the line must never stop short
  // of spend the tiles are already reporting.
  const lastWithData = hours.reduce((last, v, i) => (v > 0 ? i : last), 0);
  const upto = Math.min(23, Math.max(nowHour, lastWithData));
  const pts = guarded.slice(0, upto + 1).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = pts.length > 1 ? `M${pts.join(' L')}` : '';
  const area = pts.length > 1
    ? `${line} L${x(upto).toFixed(1)},${(T + PLOT_H).toFixed(1)} L${L},${(T + PLOT_H).toFixed(1)} Z`
    : '';

  const ceilY = hasCeiling ? y(ceiling) : 0;
  const reachedAt = hasCeiling ? guarded.findIndex(v => v >= ceiling) : -1;

  const ticks = [0, top / 2, top];

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="t">Cumulative spend</span>
        <span className="s">local time · resets at midnight</span>
        <span className="chart-legend">
          <span className="lg"><i style={{ background: '#6366f1' }} />spent</span>
          {hasCeiling && (
            <span className="lg"><i style={{ background: enforced ? '#ef4444' : '#6d6d6d' }} />
              {enforced ? 'ceiling' : 'ceiling (not enforced)'}
            </span>
          )}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={
          `Cumulative token spend today: ${fmtTokens(spent)}`
          + (hasCeiling ? ` against a ceiling of ${fmtTokens(ceiling)}` : ', with no ceiling set')
          + (reachedAt >= 0 ? `. The ceiling was reached at ${String(reachedAt).padStart(2, '0')}:00.` : '.')
        }
      >
        <g stroke="rgba(125,125,140,.16)" strokeWidth="1">
          {ticks.map((v, i) => (
            <line key={i} x1={L} y1={y(v)} x2={W - R} y2={y(v)} />
          ))}
        </g>
        <g fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#6d6d6d">
          {ticks.map((v, i) => (
            <text key={i} x={L - 6} y={y(v) + 3} textAnchor="end">{fmtTokens(v)}</text>
          ))}
          <text x={L} y={H - 7}>00:00</text>
          <text x={x(6)} y={H - 7} textAnchor="middle">06:00</text>
          <text x={x(12)} y={H - 7} textAnchor="middle">12:00</text>
          <text x={x(18)} y={H - 7} textAnchor="middle">18:00</text>
          <text x={W - R} y={H - 7} textAnchor="end">24:00</text>
        </g>

        {hasCeiling && (
          <line
            x1={L} y1={ceilY} x2={W - R} y2={ceilY}
            stroke={enforced ? '#ef4444' : '#6d6d6d'}
            strokeWidth="1.5" strokeDasharray="5 4" opacity=".85"
          />
        )}

        <defs>
          <linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity=".35" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity=".02" />
          </linearGradient>
        </defs>

        {area && <path d={area} fill="url(#burnFill)" stroke="none" />}
        {line && <path d={line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />}

        {pts.length > 0 && (
          <circle
            cx={x(upto)} cy={y(guarded[upto] ?? 0)} r="3.5"
            fill="#6366f1" stroke="var(--c-elevated)" strokeWidth="2"
          />
        )}

        {reachedAt >= 0 && reachedAt <= upto && (
          <>
            <circle cx={x(reachedAt)} cy={ceilY} r="4" fill="#ef4444"
              stroke="var(--c-elevated)" strokeWidth="2" />
            <g fontFamily="Inter, sans-serif" fontSize="10">
              <rect x={x(reachedAt) + 10} y={ceilY + 8} width="150" height="18" rx="4"
                fill="rgba(239,68,68,.16)" />
              <text x={x(reachedAt) + 18} y={ceilY + 20.5} fill="#ef4444">
                {String(reachedAt).padStart(2, '0')}:00 — ceiling reached
              </text>
            </g>
          </>
        )}

        {spent === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="11" fill="#6d6d6d"
            fontFamily="Inter, sans-serif">
            Nothing sent yet today
          </text>
        )}
      </svg>
    </div>
  );
}

/** Wrapped for screens that want it inside a titled card instead. */
export function BurnChartCard(props: Parameters<typeof BurnChart>[0]) {
  return <Card><BurnChart {...props} /></Card>;
}
