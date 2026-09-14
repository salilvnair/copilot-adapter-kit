/* The remaining rail destinations: JSON, Request Dumps, Dev Tools, Bin and the
 * Danger Zone.
 *
 * Dev Tools draws the interceptor chain because the chain is the architecture:
 * when something routes wrong, the order the request passed through is the
 * first question. */

import { useState } from 'react';
import * as I from '../../icons';
import { Btn, Card, Chip, IconBtn, PageHead, Rule } from '../../ui';
import { Confirm } from '../../ui/Confirm';
import { HoldToConfirm } from '../HoldToConfirm';
import { actions, fmtTokens, liveProviders, type AppState } from '../state';

/* ── JSON settings ────────────────────────────────────────────────────── */

export function JsonSettings({ state }: { state: AppState }) {
  const json = JSON.stringify(
    {
      'copilot-adapter-kit.budget.enforce': state.budget?.caps.enforce ?? true,
      'copilot-adapter-kit.budget.dailyTokenLimit': state.budget?.caps.dailyTokenLimit ?? 2_000_000,
      'copilot-adapter-kit.budget.dailyCostLimitUsd': state.budget?.caps.dailyCostLimitUsd ?? 25,
      'copilot-adapter-kit.budget.maxInputTokensPerRequest': state.budget?.caps.maxInputTokensPerRequest ?? 200_000,
      'copilot-adapter-kit.budget.maxTurnsPerConversation': state.budget?.caps.maxTurnsPerConversation ?? 50,
      'copilot-adapter-kit.maxTokens': state.maxTokens,
      'copilot-adapter-kit.logLevel': state.logLevel,
      'copilot-adapter-kit.providers': Object.fromEntries(
        liveProviders(state).map(([uuid, p]) => [uuid, { family: p.family, baseUrl: p.baseUrl, name: p.name }]),
      ),
    },
    null,
    2,
  );

  return (
    <div className="set-main">
      <PageHead
        title="JSON Settings"
        sub="the same values, written out"
        right={<Btn icon={<I.External size={12} />} onClick={actions.openSettings}>Edit in settings.json</Btn>}
      />
      <div className="code">
        {json.split('\n').map((line, i) => (
          <div className="ln" key={i}>
            <span className="g">{i + 1}</span>
            <span className="c">{_highlight(line)}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>
        Read-only here — this view is generated from the live settings. Keys never appear: they live in
        the OS keychain, and this file is synced by Settings Sync.
      </div>
    </div>
  );
}

/** Minimal JSON colouring, matching the mock's palette. */
function _highlight(line: string) {
  const m = line.match(/^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)?(.*)$/);
  if (!m) return line;
  const [, indent, key, colon, rest] = m;
  if (!colon) return <>{indent}<span className="ks">{key}</span>{rest}</>;
  const value = rest.replace(/,$/, '');
  const comma = rest.endsWith(',') ? ',' : '';
  const cls = /^"/.test(value) ? 'ks' : /^(true|false)$/.test(value) ? 'kb' : /^-?\d/.test(value) ? 'kn' : 'kp';
  return <>{indent}<span className="kk">{key}</span><span className="kp">{colon}</span><span className={cls}>{value}</span><span className="kp">{comma}</span></>;
}

/* ── Request dumps ────────────────────────────────────────────────────── */

export function Dumps({ state }: { state: AppState }) {
  const refusals = state.budget?.day.refusals ?? [];
  const byModel = Object.entries(state.budget?.day.byModel ?? {});

  return (
    <div className="set-main">
      <PageHead
        title="Requests"
        sub={`${state.budget?.day.requests ?? 0} today`}
        right={
          <>
            {state.logLevel === 'dump' && <Chip tone="warn" mono>dump level on</Chip>}
            <Btn icon={<I.Folder size={12} />} onClick={actions.openDumps}>Open folder</Btn>
          </>
        }
      />

      <Card header="By model" right={`${byModel.length} active`}>
        {byModel.length === 0 ? (
          <Empty text="Nothing sent today." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dtbl">
              <thead>
                <tr>
                  <th>Model</th><th className="num">Requests</th>
                  <th className="num">In</th><th className="num">Out</th><th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map(([id, m]) => (
                  <tr key={id}>
                    <td>{id}</td>
                    <td className="num">{m.requests}</td>
                    <td className="num">{fmtTokens(m.inputTokens)}</td>
                    <td className="num">{fmtTokens(m.outputTokens)}</td>
                    <td className="num">{m.costUsd > 0 ? `$${m.costUsd.toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card header="Refused" right={`${state.budget?.day.blocked ?? 0} today`}>
        {refusals.length === 0 ? <Empty text="Nothing refused today." /> : refusals.map((r, i) => (
          <div className="feed-row" key={i}>
            <span className="feed-time mono">{_clock(r.at)}</span>
            <span className="feed-txt">
              {r.reason.split(' — ')[0]}
              <span className="sub">{r.modelId} · ~{fmtTokens(r.estimatedInput)} would have been sent</span>
            </span>
          </div>
        ))}
      </Card>

      {state.logLevel === 'dump' && (
        <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--c-warning)', display: 'flex', marginTop: 2 }}><I.Warning size={12} /></span>
          Dumps contain your full system prompt, files and tool schemas, written unencrypted to the temp folder.
        </div>
      )}
    </div>
  );
}

/* ── Dev tools ────────────────────────────────────────────────────────── */

export function DevTools({ state }: { state: AppState }) {
  const provs = liveProviders(state);
  return (
    <div className="set-main">
      <PageHead title="Engine mesh" sub="how a request reaches a provider" />

      <Card header="Interceptor chain" right="order matters — the guard must see it first">
        <div className="chain" style={{ paddingTop: 12, overflowX: 'auto' }}>
          <span className="node"><span className="a">Copilot</span><span className="b">messages in</span></span>
          <span className="arr"><I.ArrowRight size={15} /></span>
          <span className="node hot"><span className="a">BudgetWarden</span><span className="b">refuse or allow</span></span>
          <span className="arr"><I.ArrowRight size={15} /></span>
          <span className="node"><span className="a">RateLimitGuard</span><span className="b">429 retry ×3</span></span>
          <span className="arr"><I.ArrowRight size={15} /></span>
          <span className="node"><span className="a">ErrorWarden</span><span className="b">readable faults</span></span>
          <span className="arr"><I.ArrowRight size={15} /></span>
          <span className="node"><span className="a">DiagTracer</span><span className="b">fingerprint</span></span>
          <span className="arr"><I.ArrowRight size={15} /></span>
          <span className="node eng"><span className="a">Engine</span><span className="b">SSE stream</span></span>
        </div>
      </Card>

      <Card header="Configured providers" right={`${provs.length}`}>
        <table className="models">
          <thead>
            <tr><th>Family</th><th>Engine</th><th>Endpoint</th><th className="num">Models</th></tr>
          </thead>
          <tbody>
            {provs.map(([uuid, p]) => (
              <tr key={uuid}>
                <td>{p.family}</td>
                <td>
                  {p.family === 'anthropic'
                    ? <Chip tone="pri" style={{ height: 17, fontSize: 9.5 }}>native</Chip>
                    : <Chip tone="mute" style={{ height: 17, fontSize: 9.5 }}>openai-compat</Chip>}
                </td>
                <td className="mono" style={{ fontSize: 10.5 }}>{p.baseUrl.replace(/^https?:\/\//, '')}</td>
                <td className="num">{(state.models[uuid] ?? []).filter(m => !m._deleted).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ── Bin ──────────────────────────────────────────────────────────────── */

export function Bin({ state }: { state: AppState }) {
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const provs = Object.entries(state.providers).filter(([, p]) => p?._deleted);
  const models: [string, NonNullable<AppState['models'][string]>[number]][] = [];
  for (const [uuid, arr] of Object.entries(state.models)) {
    for (const m of arr ?? []) if (m?._deleted) models.push([uuid, m]);
  }
  const total = provs.length + models.length;

  return (
    <div className="set-main">
      <PageHead
        title="Bin"
        sub="removed providers and models, recoverable"
        right={total > 0
          ? <Btn variant="danger" onClick={() => setConfirmEmpty(true)}>Empty bin</Btn>
          : undefined}
      />

      {total === 0 ? (
        <Empty text="Nothing here. Removed providers and models land in the bin first." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {provs.map(([uuid, p]) => (
            <div className="krow" key={uuid}>
              <span className="prov-mark">{(p.name ?? p.family ?? '??').slice(0, 2).toUpperCase()}</span>
              <span className="prov-n" style={{ flex: 1 }}>
                <span className="a">{p.name || p.family}</span>
                <span className="b">{p.baseUrl}</span>
              </span>
              <Chip tone="warn">key kept in keychain</Chip>
              <span style={{ display: 'flex', gap: 5 }}>
                <Btn style={{ height: 24, fontSize: 11 }} icon={<I.Restore size={11} />}
                  onClick={() => actions.restoreProvider(uuid)}>Restore</Btn>
                <IconBtn icon={<I.Trash />} label={`Delete ${p.name ?? uuid} forever`} ghost
                  onClick={() => actions.permDeleteProvider(uuid)} />
              </span>
            </div>
          ))}
          {models.map(([uuid, m]) => (
            <div className="krow" key={(m.uuid ?? m.id) + uuid}>
              <span className="prov-mark" style={{ fontSize: 9 }}>{(m.name ?? m.id).slice(0, 2).toUpperCase()}</span>
              <span className="prov-n" style={{ flex: 1 }}>
                <span className="a">{m.name || m.id}</span>
                <span className="b">under {state.providers[uuid]?.name ?? uuid}</span>
              </span>
              <span style={{ display: 'flex', gap: 5 }}>
                <Btn style={{ height: 24, fontSize: 11 }} icon={<I.Restore size={11} />}
                  onClick={() => actions.restoreModel(uuid, m.uuid ?? m._key ?? m.id)}>Restore</Btn>
                <IconBtn icon={<I.Trash />} label={`Delete ${m.name ?? m.id} forever`} ghost
                  onClick={() => actions.permDeleteModel(uuid, m.uuid ?? m._key ?? m.id)} />
              </span>
            </div>
          ))}
        </div>
      )}

      <Rule />
      <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
        <I.Info size={12} />
        Items here still sit in <span className="mono">settings.json</span> carrying{' '}
        <span className="mono">_deleted: true</span>, and they sync between machines. Removing a provider
        never removes its key — clear that separately from API Keys.
      </div>

      <Confirm
        open={confirmEmpty}
        title="Empty the bin?"
        message={`${total} item${total === 1 ? '' : 's'} will be deleted permanently. This cannot be undone, and it is not the same as removing the API keys, which stay in the keychain.`}
        confirmLabel="Delete permanently"
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => { setConfirmEmpty(false); actions.clearBin(); }}
      />
    </div>
  );
}

/* ── Danger zone ──────────────────────────────────────────────────────── */

export function Danger({ state }: { state: AppState }) {
  const provs = liveProviders(state).length;
  const models = Object.values(state.models).flat().filter(m => m && !m._deleted).length;
  const keys = Object.values(state.keys).filter(Boolean).length;
  const history = state.budget?.history ?? [];
  const lifetime = history.reduce((n, d) => n + d.tokens, 0)
    + (state.budget ? state.budget.day.inputTokens + state.budget.day.outputTokens : 0);

  return (
    <div className="set-main">
      <PageHead title="Danger zone" sub="nothing here is reversible" />

      <div className="pane-2">
        <div className="dz">
          <span className="t"><I.Trash size={14} />Remove all providers</span>
          <span className="d">
            Deletes <b>{provs} provider{provs === 1 ? '' : 's'}</b> and the <b>{models} model
            {models === 1 ? '' : 's'}</b> under them. Keys stay in the keychain.
          </span>
          <HoldToConfirm seconds={2} label="Hold to remove" onConfirm={actions.deleteAllProviders} />
        </div>

        <div className="dz">
          <span className="t"><I.Lock size={14} />Clear every API key</span>
          <span className="d">
            Removes <b>{keys} key{keys === 1 ? '' : 's'}</b> from the OS keychain. Providers stay; models
            vanish from the picker until keys return.
          </span>
          <HoldToConfirm seconds={2} label="Hold to clear" onConfirm={actions.clearAllKeys} />
        </div>

        <div className="dz">
          <span className="t"><I.Refresh size={14} />Reset settings to defaults</span>
          <span className="d">
            The spend guard returns to 2.00M tokens and $25.00 per day, and every prompt template is cleared.
          </span>
          <HoldToConfirm seconds={2} label="Hold to reset" onConfirm={actions.resetSettings} />
        </div>

        <div className="dz" style={{ borderColor: 'var(--c-error)', background: 'rgba(239,68,68,.1)' }}>
          <span className="t"><I.Warning size={14} />Factory reset</span>
          <span className="d">
            Everything above at once, plus the bin, the usage ledger (<b>{fmtTokens(lifetime)} tokens of
            history</b>) and every request dump.
          </span>
          <HoldToConfirm seconds={4} label="Hold to wipe" onConfirm={actions.factoryReset} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
        <I.Info size={12} />
        Holding is used instead of a dialog because a dialog trains you to click through it. The count in
        each sentence is read live, so it is never stale.
      </div>
    </div>
  );
}

/* ── Shared ───────────────────────────────────────────────────────────── */

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: 'var(--c-muted)', padding: '8px 0' }}>{text}</div>;
}

function _clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
