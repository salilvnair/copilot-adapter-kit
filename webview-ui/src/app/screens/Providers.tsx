/* Providers — the mock's main settings screen.
 *
 * Four card states on one grid: live, no key, failing, offline. The stripe on
 * the card edge carries the state so it reads without reading. */

import { useEffect, useMemo, useState } from 'react';
import * as I from '../../icons';
import { Btn, Chip, IconBtn, IconBtnGroup, PageHead, Spark } from '../../ui';
import { Confirm } from '../../ui/Confirm';
import { Menu } from '../../ui/Menu';
import { SidePanel } from '../../ui/SidePanel';
import { AddProviderDrawer } from '../ProviderDrawer';
import type { Route } from '../Shell';
import {
  actions, fmtTokens, liveProviders, mark, modelsFor, provState, shortUrl,
  type AppState, type ProvState, type ProviderCfg,
} from '../state';

export function Providers({ state, go }: { state: AppState; go: (r: Route) => void }) {
  const [filter, setFilter] = useState('');
  const [dense, setDense] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const provs = useMemo(() => {
    const all = liveProviders(state);
    if (!filter.trim()) return all;
    const q = filter.toLowerCase();
    return all.filter(([, p]) =>
      (p.name ?? '').toLowerCase().includes(q)
      || (p.family ?? '').toLowerCase().includes(q)
      || p.baseUrl.toLowerCase().includes(q));
  }, [state, filter]);

  const counts = provs.reduce(
    (acc, [uuid, p]) => {
      const s = provState(state, uuid, p);
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<ProvState, number>,
  );

  if (liveProviders(state).length === 0) {
    return <FirstRun onAdd={() => setAdding(true)} adding={adding} close={() => setAdding(false)} state={state} />;
  }

  const sub = [
    counts.live ? `${counts.live} live` : null,
    counts.warn ? `${counts.warn} needs a key` : null,
    counts.err ? `${counts.err} failing` : null,
    counts.off ? `${counts.off} offline` : null,
  ].filter(Boolean).join(' · ');

  const main = (
      <div className="set-main in-split">
        <PageHead
          title="Providers"
          sub={sub}
          right={
            <>
              <label className="search-f">
                <I.Search size={12} />
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="Filter"
                  aria-label="Filter providers"
                />
              </label>
              <IconBtnGroup>
                <IconBtn icon={<I.Grid />} label="Card view" on={!dense} onClick={() => setDense(false)} />
                <IconBtn icon={<I.Menu />} label="Compact view" on={dense} onClick={() => setDense(true)} />
              </IconBtnGroup>
              <IconBtn icon={<I.Refresh />} label="Check reachability" onClick={actions.testAllProviders} />
              <Btn variant="pri" icon={<I.Plus size={12} />} onClick={() => setAdding(true)}>Add provider</Btn>
            </>
          }
        />

        <div className="prov-grid" style={dense ? { gridTemplateColumns: '1fr' } : undefined}>
          {provs.map(([uuid, p]) => (
            <ProviderCard
              key={uuid}
              uuid={uuid}
              p={p}
              state={state}
              onEdit={() => setEditing(uuid)}
              go={go}
            />
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', gap: 7, alignItems: 'center' }}>
          <I.Info size={12} />
          Reachability checked when the panel opens, then hourly. Never with your key attached.
        </div>
      </div>
  );

  return (
    <SidePanel
      main={main}
      panel={(adding || editing) ? (
        <AddProviderDrawer
          state={state}
          uuid={editing ?? undefined}
          close={() => { setAdding(false); setEditing(null); }}
        />
      ) : undefined}
    />
  );
}

/* ── Card ─────────────────────────────────────────────────────────────── */

function ProviderCard({
  uuid, p, state, onEdit, go,
}: {
  uuid: string;
  p: ProviderCfg;
  state: AppState;
  onEdit: () => void;
  go: (r: Route) => void;
}) {
  const s = provState(state, uuid, p);
  const h = state.health[uuid];
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Cleared by the next snapshot from the host, which is the signal the work landed.
  const [busy, setBusy] = useState<'test' | 'duplicate' | null>(null);
  useEffect(() => { setBusy(null); }, [state]);
  const models = modelsFor(state, uuid);
  const spend = models.reduce((n, m) => n + (state.usageByModel[m.id]?.inputTokens ?? 0)
    + (state.usageByModel[m.id]?.outputTokens ?? 0), 0);
  const reqs = models.map(m => state.usageByModel[m.id]?.requests ?? 0);
  const local = /localhost|127\.0\.0\.1/.test(p.baseUrl);

  return (
    <div className={`prov${s === 'live' ? '' : ' ' + s}${busy ? ' is-busy' : ''}`}>
      <div className="prov-h">
        <span className="prov-mark">{mark(p)}</span>
        <span className="prov-n">
          <span className="a">{p.name || p.family || uuid}</span>
          <span className="b">{shortUrl(p.baseUrl)}</span>
        </span>
        <span className="acts">
          <IconBtn icon={<I.Pencil />} label={`Edit ${p.name || p.family}`} ghost onClick={onEdit} />
          <Menu
            label={`More actions for ${p.name || p.family}`}
            items={[
              {
                id: 'test',
                label: 'Check reachability',
                description: 'Sent without your key attached',
                icon: <I.Refresh size={13} />,
                onClick: () => { setBusy('test'); actions.testProvider(uuid); },
              },
              {
                id: 'key',
                label: state.keys[uuid] ? 'Replace API key' : 'Add API key',
                icon: <I.Key size={13} />,
                disabled: local && !state.keys[uuid],
                description: local && !state.keys[uuid] ? 'Local endpoint — nothing to store' : undefined,
                onClick: () => go('keys'),
              },
              {
                id: 'duplicate',
                label: 'Duplicate',
                description: 'Copies the endpoint and its models',
                icon: <I.Copy size={13} />,
                onClick: () => { setBusy('duplicate'); actions.duplicateProvider(uuid); },
              },
              { id: 'sep', label: '', separator: true },
              {
                id: 'remove',
                label: 'Remove provider',
                description: 'Moves it to the Bin — the key is kept',
                icon: <I.Trash size={13} />,
                danger: true,
                onClick: () => setConfirmRemove(true),
              },
            ]}
          />
        </span>
      </div>

      <div className="prov-meta">
        {s === 'live' && <Chip tone="ok" dot>Live</Chip>}
        {s === 'warn' && <Chip tone="warn" dot>No key</Chip>}
        {s === 'err' && <Chip tone="err" dot>{_authTime(h?.authFailedAt)}</Chip>}
        {s === 'off' && <Chip tone="mute" dot>Not running</Chip>}

        {busy === 'test'
          ? <Chip tone="mute"><span className="spin"><I.Refresh size={10} /></span>Checking…</Chip>
          : h?.ms !== undefined && s !== 'off' && <Chip tone="mute" mono>{h.ms} ms</Chip>}
        {s === 'warn'
          ? <Chip tone="mute">{models.length} models hidden</Chip>
          : <Chip tone="mute">{models.length} model{models.length === 1 ? '' : 's'}</Chip>}
        {local && <Chip tone="pri">local · free</Chip>}

        {reqs.filter(Boolean).length >= 2 && (
          <Spark bars={reqs.slice(0, 8)} label="Requests today, by model"
            style={{ marginLeft: 'auto' }} />
        )}
      </div>

      <div className="prov-foot">
        {s === 'err' ? (
          <>
            <span style={{ color: 'var(--c-error)' }}>Key rejected — replace it</span>
            <Btn style={{ height: 24, fontSize: 11, marginLeft: 'auto' }}
              onClick={() => actions.testProvider(uuid)}>Retry</Btn>
          </>
        ) : s === 'warn' ? (
          <>
            <Btn icon={<I.Key size={11} />} style={{ height: 24, fontSize: 11 }}
              onClick={() => go('keys')}>Add key</Btn>
            <span style={{ marginLeft: 'auto' }}>Models stay hidden until set</span>
          </>
        ) : local && !state.keys[uuid] ? (
          <>
            No key needed
            <span style={{ marginLeft: 'auto' }} className="mono">
              {h?.checkedAt ? _ago(h.checkedAt) : '—'}
            </span>
          </>
        ) : (
          <>
            <span style={{ color: 'var(--c-success)', display: 'flex' }}>
              <I.Check size={11} width={2.4} />
            </span>
            Key in keychain
            <span style={{ marginLeft: 'auto' }} className="mono">
              {spend ? `${fmtTokens(spend)} today` : 'unused today'}
            </span>
          </>
        )}
      </div>

      <Confirm
        open={confirmRemove}
        title={`Remove ${p.name || p.family}?`}
        message={
          `Its ${models.length} model${models.length === 1 ? '' : 's'} go with it and stop appearing in the `
          + 'Copilot picker. Both are recoverable from the Bin, and the API key is kept in the keychain.'
        }
        confirmLabel="Remove"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => { setConfirmRemove(false); actions.removeProvider(uuid); }}
      />
    </div>
  );
}

function _authTime(at?: number): string {
  if (!at) return '401';
  const d = new Date(at);
  return `401 at ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function _ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `last seen ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `last seen ${hrs}h`;
  return `last seen ${Math.round(hrs / 24)}d`;
}

/* ── First run ────────────────────────────────────────────────────────── */

function FirstRun({
  onAdd, adding, close, state,
}: {
  onAdd: () => void;
  adding: boolean;
  close: () => void;
  state: AppState;
}) {
  const ollama = state.health['probe:ollama'];

  const main = (
      <div className="set-main in-split">
        <PageHead title="Providers" sub="nothing configured yet" />
        <div className="setup-grid">
          <div className={`setup${ollama?.reachable ? ' lead' : ''}`}>
            <span className="ico"><I.Monitor size={16} /></span>
            <span className="t">Ollama is running here</span>
            <span className="d">
              {ollama?.reachable
                ? <>Answering on <span className="mono">localhost:11434</span>. No key, no bill.</>
                : <>Nothing answered on <span className="mono">localhost:11434</span>. Start Ollama and check again.</>}
            </span>
            <Btn variant={ollama?.reachable ? 'pri' : 'default'} style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                actions.saveProvider('', { family: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1' });
              }}>
              {ollama?.reachable ? 'Use it' : 'Add anyway'}
            </Btn>
          </div>

          <div className="setup">
            <span className="ico"><I.Key size={16} /></span>
            <span className="t">Paste an API key</span>
            <span className="d">
              The prefix picks the provider — <span className="mono">sk-ant-</span>,{' '}
              <span className="mono">gsk_</span>, <span className="mono">sk-</span>.
            </span>
            <Btn style={{ alignSelf: 'flex-start' }} onClick={onAdd}>Paste key</Btn>
          </div>

          <div className="setup">
            <span className="ico"><I.Globe size={16} /></span>
            <span className="t">Any OpenAI-compatible URL</span>
            <span className="d">
              vLLM, LM Studio, a gateway at work. {state.engineFamilies.length} families are preset.
            </span>
            <Btn style={{ alignSelf: 'flex-start' }} onClick={onAdd}>Enter URL</Btn>
          </div>
        </div>
      </div>
  );

  return (
    <SidePanel
      main={main}
      panel={adding ? <AddProviderDrawer state={state} close={close} /> : undefined}
    />
  );
}
