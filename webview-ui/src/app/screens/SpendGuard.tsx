/* Spend Guard — the dashboard from the mock.
 *
 * The centrepiece is the cumulative curve against the ceiling, because that is
 * the shape that makes a runaway legible while it is still running: at 03:00
 * you can see the line is aimed at the cap hours before it arrives.
 *
 * Rendered in two places from this one component — as the rail's Guard screen,
 * and as the standalone panel that replaced the native modal. */

import { useState } from 'react';
import * as I from '../../icons';
import { Btn, Card, Chip, IconBtn, Meter, PageHead, Segmented, SettingRow, Stepper, Tile } from '../../ui';
import { BurnChart } from '../BurnChart';
import { HoldToConfirm } from '../HoldToConfirm';
import { actions, fmtTokens, type AppState, type BudgetSnapshot } from '../state';

export function SpendGuard({ state, standalone = false }: { state: AppState; standalone?: boolean }) {
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const b = state.budget;

  if (!b) {
    return (
      <div className="set-main">
        <PageHead title="Spend Guard" sub="no usage recorded yet" />
      </div>
    );
  }

  return (
    <div className={standalone ? 'sg' : 'set-main'}>
      <div className="sg-head">
        <div className="sg-title">
          <h3>Spend Guard</h3>
          {/* The header says whether protection is on; the tile says whether it
              is currently turning requests away. Two different facts. */}
          {b.caps.enforce
            ? <Chip tone="ok" dot>Protected</Chip>
            : <Chip tone="err" dot>UNCAPPED</Chip>}
        </div>
        <div className="right">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[{ value: 'today', label: 'Today' }, { value: 'history', label: 'History' }]}
          />
          <Chip tone="mute" mono>{_dayLabel(b.day.day)}</Chip>
          <Btn variant="ghost" onClick={actions.resetBudget}>Reset counters</Btn>
          <IconBtn icon={<I.Braces />} label="Open settings.json" onClick={actions.openSettings} />
        </div>
      </div>

      {tab === 'today' ? <Today b={b} /> : <History b={b} />}
    </div>
  );
}

/* ── Today ────────────────────────────────────────────────────────────── */

function Today({ b }: { b: BudgetSnapshot }) {
  const used = b.day.inputTokens + b.day.outputTokens;
  const tokenPct = b.tokenPct >= 0 ? b.tokenPct : 0;
  const costPct = b.costPct >= 0 ? b.costPct : 0;
  const models = Object.entries(b.day.byModel)
    .sort((a, c) => (c[1].inputTokens + c[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens));
  const topSpend = models[0] ? models[0][1].inputTokens + models[0][1].outputTokens : 1;

  return (
    <>
      <div className="sg-hero">
        <Tile label="Tokens today">
          <div className="ring-wrap">
            <Ring pct={tokenPct} />
            <div className="ring-figs">
              <div className="tile-v mono">{fmtTokens(used)}</div>
              <div className="tile-sub mono">
                {b.caps.dailyTokenLimit > 0 ? `of ${fmtTokens(b.caps.dailyTokenLimit)}` : 'no limit'}
              </div>
              {b.overLimit && <Chip tone="err" dot className="self-start" style={{ marginTop: 5 }}>Blocking</Chip>}
            </div>
          </div>
        </Tile>

        <Tile label="Estimated cost">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <div>
              <div className="tile-v mono">${b.day.costUsd.toFixed(2)}</div>
              <div className="tile-sub mono">
                {b.caps.dailyCostLimitUsd > 0
                  ? `of $${b.caps.dailyCostLimitUsd.toFixed(2)} · ${Math.round(costPct)}%`
                  : 'no limit'}
              </div>
            </div>
          </div>
          <Meter pct={costPct} tone={costPct >= 100 ? 'err' : costPct >= 80 ? 'warn' : 'pri'} />
          <div className="tile-sub">
            Priced from each model&rsquo;s <span className="mono">pricing</span> string
          </div>
        </Tile>

        <Tile label="Requests">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div className="tile-v mono">{b.day.requests}</div>
            <div className="tile-sub">sent</div>
            <div className="tile-v mono" style={{ color: 'var(--c-error)', fontSize: 20 }}>{b.day.blocked}</div>
            <div className="tile-sub">blocked</div>
          </div>
          <Segments sent={b.day.requests} blocked={b.day.blocked} />
          <div className="tile-sub">
            {b.day.estimated
              ? 'Some figures estimated — a provider reported no usage'
              : `Turn limit ${b.caps.maxTurnsPerConversation || 'off'} per conversation`}
          </div>
        </Tile>
      </div>

      <BurnChart
        hourly={b.day.hourly}
        ceiling={b.caps.dailyTokenLimit}
        enforced={b.caps.enforce}
      />

      <div className="sg-cols">
        <Card header="Limits" right="applied before the request is sent">
          <Limits b={b} />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <Card header="By model" right={`${models.length} active`}>
            {models.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--c-muted)', padding: '8px 0' }}>
                Nothing sent today.
              </div>
            ) : (
              <table className="models">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="num">Tokens</th>
                    <th className="num">Cost</th>
                    <th style={{ width: 78 }} />
                  </tr>
                </thead>
                <tbody>
                  {models.slice(0, 6).map(([id, m]) => {
                    const t = m.inputTokens + m.outputTokens;
                    return (
                      <tr key={id}>
                        <td>{id}</td>
                        <td className="num mono">{fmtTokens(t)}</td>
                        <td className="num mono">{m.costUsd > 0 ? `$${m.costUsd.toFixed(2)}` : '—'}</td>
                        <td><div className="mbar" style={{ width: `${Math.round((t / topSpend) * 100)}%` }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card header="Refused" right={`${b.day.blocked} today`}>
            {b.day.refusals.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--c-muted)', padding: '8px 0' }}>
                Nothing refused today.
              </div>
            ) : b.day.refusals.slice(0, 4).map((r, i) => (
              <div className="feed-row" key={i}>
                <span className="feed-time mono">{_clock(r.at)}</span>
                <span className="feed-txt">
                  {_headline(r.reason)}
                  <span className="sub">
                    {r.modelId} · ~{fmtTokens(r.estimatedInput)} would have been sent
                  </span>
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <DangerZone enforced={b.caps.enforce} />
    </>
  );
}

/* ── Limits ───────────────────────────────────────────────────────────── */

function Limits({ b }: { b: BudgetSnapshot }) {
  const c = b.caps;
  const used = b.day.inputTokens + b.day.outputTokens;
  const set = (key: string, value: number) => actions.saveConfig(`budget.${key}`, value);

  return (
    <>
      <SettingRow
        name="Daily tokens"
        desc={c.dailyTokenLimit > 0
          ? (b.overLimit ? 'Reached — further requests are refused' : `${fmtTokens(c.dailyTokenLimit - used)} left today`)
          : 'No limit — nothing stops a runaway'}
      >
        <Stepper
          label="Daily tokens"
          value={c.dailyTokenLimit > 0 ? fmtTokens(c.dailyTokenLimit) : 'off'}
          onDec={() => set('dailyTokenLimit', Math.max(0, c.dailyTokenLimit - 250_000))}
          onInc={() => set('dailyTokenLimit', c.dailyTokenLimit + 250_000)}
        />
      </SettingRow>

      <SettingRow
        name="Daily cost"
        desc={c.dailyCostLimitUsd > 0
          ? `$${Math.max(0, c.dailyCostLimitUsd - b.day.costUsd).toFixed(2)} left today`
          : 'No limit'}
      >
        <Stepper
          label="Daily cost"
          value={c.dailyCostLimitUsd > 0 ? `$${c.dailyCostLimitUsd.toFixed(2)}` : 'off'}
          onDec={() => set('dailyCostLimitUsd', Math.max(0, c.dailyCostLimitUsd - 5))}
          onInc={() => set('dailyCostLimitUsd', c.dailyCostLimitUsd + 5)}
        />
      </SettingRow>

      <SettingRow
        name="Input per request"
        desc="A single oversized request cannot take the whole budget"
      >
        <Stepper
          label="Input per request"
          value={c.maxInputTokensPerRequest > 0 ? fmtTokens(c.maxInputTokensPerRequest) : 'off'}
          onDec={() => set('maxInputTokensPerRequest', Math.max(0, c.maxInputTokensPerRequest - 25_000))}
          onInc={() => set('maxInputTokensPerRequest', c.maxInputTokensPerRequest + 25_000)}
        />
      </SettingRow>

      <SettingRow
        name="Output per request"
        desc="Zero follows each model's declared maximum. Output is never unbounded."
      >
        <Stepper
          label="Output per request"
          value={c.maxOutputTokens > 0 ? fmtTokens(c.maxOutputTokens) : 'model'}
          onDec={() => set('maxOutputTokens', Math.max(0, c.maxOutputTokens - 4096))}
          onInc={() => set('maxOutputTokens', c.maxOutputTokens + 4096)}
        />
      </SettingRow>

      <SettingRow
        name="Turns per conversation"
        desc="Each agent tool round-trip resends the whole conversation. This is the cap that stops an overnight runaway."
      >
        <Stepper
          label="Turns per conversation"
          value={c.maxTurnsPerConversation > 0 ? c.maxTurnsPerConversation : 'off'}
          onDec={() => set('maxTurnsPerConversation', Math.max(0, c.maxTurnsPerConversation - 10))}
          onInc={() => set('maxTurnsPerConversation', c.maxTurnsPerConversation + 10)}
        />
      </SettingRow>
    </>
  );
}

/* ── Danger zone ──────────────────────────────────────────────────────── */

function DangerZone({ enforced }: { enforced: boolean }) {
  if (!enforced) {
    return (
      <div className="danger-zone" style={{ borderColor: 'var(--c-error)', background: 'rgba(239,68,68,.1)' }}>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-error)' }}>
            Protection is off
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>
            No daily budget, no per-request ceiling, no loop guard. Requests are unbounded.
          </div>
        </div>
        <Btn variant="pri" icon={<I.Shield size={12} />} onClick={() => actions.setGuard(true)}>
          Re-enable protection
        </Btn>
      </div>
    );
  }

  return (
    <div className="danger-zone">
      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-error)' }}>
          Remove all protection
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>
          Every limit above stops applying. The status bar stays red until you switch it back on.
        </div>
      </div>
      <HoldToConfirm seconds={2} onConfirm={() => actions.setGuard(false)} label="Hold to disable" />
    </div>
  );
}

/* ── History ──────────────────────────────────────────────────────────── */

function History({ b }: { b: BudgetSnapshot }) {
  const days = _calendar(b);
  const max = Math.max(...days.map(d => d?.tokens ?? 0), 1);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked
    ? days.find(d => d?.day === picked) ?? null
    : days.filter(Boolean).slice(-1)[0] ?? null;

  const total = days.reduce((n, d) => n + (d?.tokens ?? 0), 0);
  const cost = days.reduce((n, d) => n + (d?.costUsd ?? 0), 0);

  return (
    <>
      <PageHead
        title="History"
        sub={`14 weeks · ${fmtTokens(total)} tokens · $${cost.toFixed(2)}`}
      />

      <Card>
        <div className="heat" style={{ gridTemplateColumns: 'repeat(14, 1fr)', gap: 4 }}>
          {days.map((d, i) => (
            <button
              key={i}
              type="button"
              className={d?.capped ? 'hx' : _level(d?.tokens ?? 0, max)}
              onClick={() => d && setPicked(d.day)}
              aria-label={d ? `${d.day}: ${fmtTokens(d.tokens)} tokens` : 'no data'}
              title={d ? `${d.day} — ${fmtTokens(d.tokens)} tokens, $${d.costUsd.toFixed(2)}` : undefined}
            />
          ))}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 11,
          fontSize: 10.5, color: 'var(--c-muted)',
        }}>
          <span>{days.find(Boolean)?.day ?? ''}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            Less
            <i className="heat-key" /><i className="heat-key h1" /><i className="heat-key h2" />
            <i className="heat-key h3" /><i className="heat-key h4" />
            More
            <i className="heat-key hx" style={{ marginLeft: 8 }} /> Cap reached
          </span>
          <span>{b.day.day}</span>
        </div>
      </Card>

      <div className="sg-cols">
        <Card header={sel ? _dayLabel(sel.day) : 'No day selected'} right={picked ? 'selected' : 'most recent'}>
          {sel ? (
            <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <div><div className="tile-k">Tokens</div><div className="mono" style={{ fontSize: 17 }}>{fmtTokens(sel.tokens)}</div></div>
                <div><div className="tile-k">Cost</div><div className="mono" style={{ fontSize: 17 }}>${sel.costUsd.toFixed(2)}</div></div>
                <div><div className="tile-k">Requests</div><div className="mono" style={{ fontSize: 17 }}>{sel.requests}</div></div>
                <div>
                  <div className="tile-k">Blocked</div>
                  <div className="mono" style={{ fontSize: 17, color: sel.blocked ? 'var(--c-error)' : undefined }}>
                    {sel.blocked}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--c-muted)', padding: '8px 0' }}>
              No history yet — days are filed here once they finish.
            </div>
          )}
        </Card>

        <Card header="Weeks">
          <table className="models">
            <tbody>
              {_weeks(days).map(w => (
                <tr key={w.label}>
                  <td>{w.label}</td>
                  <td className="num mono">{fmtTokens(w.tokens)}</td>
                  <td className="num mono">${w.costUsd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

/* ── Small parts ──────────────────────────────────────────────────────── */

function Ring({ pct }: { pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  const circumference = 188.5; // 2πr, r = 30
  const tone = p >= 100 ? '#ef4444' : p >= 80 ? '#f59e0b' : '#6366f1';
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-label={`${Math.round(p)} percent of the daily token budget used`}>
      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(125,125,140,.22)" strokeWidth="8" />
      <circle
        cx="36" cy="36" r="30" fill="none" stroke={tone} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(p / 100) * circumference} ${circumference}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="34" textAnchor="middle" fontSize="15" fontWeight="600" fill="currentColor"
        fontFamily="JetBrains Mono, monospace">{Math.round(p)}</text>
      <text x="36" y="46" textAnchor="middle" fontSize="9" fill="#6d6d6d" fontFamily="Inter, sans-serif">percent</text>
    </svg>
  );
}

function Segments({ sent, blocked }: { sent: number; blocked: number }) {
  const total = sent + blocked;
  const cells = 14;
  const blockedCells = total ? Math.round((blocked / total) * cells) : 0;
  return (
    <div className="seg-row" aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={`seg${i >= cells - blockedCells && blocked ? ' blocked' : total ? ' on' : ''}`} />
      ))}
    </div>
  );
}

function _clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The first clause of a refusal reason, which is the part worth reading. */
function _headline(reason: string): string {
  return reason.split(' — ')[0].replace(/\.$/, '');
}

function _dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function _level(tokens: number, max: number): string {
  if (!tokens) return '';
  const r = tokens / max;
  if (r > 0.75) return 'h4';
  if (r > 0.5) return 'h3';
  if (r > 0.25) return 'h2';
  return 'h1';
}

interface Day { day: string; tokens: number; costUsd: number; requests: number; blocked: number; capped: boolean }

/** 98 cells ending today, padded so each column is one week (Sunday first). */
function _calendar(b: BudgetSnapshot): (Day | null)[] {
  const byDay = new Map<string, Day>();
  for (const d of b.history) byDay.set(d.day, d);
  byDay.set(b.day.day, {
    day: b.day.day,
    tokens: b.day.inputTokens + b.day.outputTokens,
    costUsd: b.day.costUsd,
    requests: b.day.requests,
    blocked: b.day.blocked,
    capped: b.overLimit,
  });

  const out: (Day | null)[] = [];
  const today = new Date(`${b.day.day}T12:00:00`);
  // Blank cells before the first day so the grid's rows line up with weekdays.
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - 97);
  for (let pad = 0; pad < firstDay.getDay(); pad++) out.push(null);
  for (let i = 97; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(byDay.get(key) ?? null);
  }
  return out;
}

function _weeks(days: (Day | null)[]): { label: string; tokens: number; costUsd: number }[] {
  const chunk = (from: number, to: number) => days.slice(from, to).reduce(
    (acc, d) => ({ tokens: acc.tokens + (d?.tokens ?? 0), costUsd: acc.costUsd + (d?.costUsd ?? 0) }),
    { tokens: 0, costUsd: 0 },
  );
  const all = chunk(0, 98);
  const weeks = Math.max(1, days.filter(Boolean).length / 7);
  return [
    { label: 'This week', ...chunk(91, 98) },
    { label: 'Last week', ...chunk(84, 91) },
    { label: '2 weeks ago', ...chunk(77, 84) },
    { label: 'Weekly average', tokens: Math.round(all.tokens / weeks), costUsd: all.costUsd / weeks },
  ];
}
