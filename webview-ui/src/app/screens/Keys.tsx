/* API Keys — existence, health and age.
 *
 * Those are the three things the panel can honestly report. The key itself
 * lives in the OS keychain and is never read back into the webview; validity is
 * inferred from responses to real requests, never from a test call carrying it. */

import { useState } from 'react';
import * as I from '../../icons';
import { Btn, Chip, IconBtn, PageHead, Rule } from '../../ui';
import type { Route } from '../Shell';
import { actions, liveProviders, mark, modelsFor, type AppState, type ProviderCfg } from '../state';

export function Keys({ state, go }: { state: AppState; go: (r: Route) => void }) {
  const provs = liveProviders(state);
  const stored = provs.filter(([uuid]) => state.keys[uuid]).length;
  const missing = provs.filter(([uuid, p]) => !state.keys[uuid] && !_local(p)).length;

  return (
    <div className="set-main">
      <PageHead
        title="API Keys"
        sub={_store()}
        right={
          <Btn icon={<I.Refresh size={12} />} onClick={actions.testAllProviders}>Test all</Btn>
        }
      />

      {provs.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--c-muted)', display: 'flex', gap: 9, alignItems: 'center' }}>
          No providers yet.
          <Btn style={{ height: 24, fontSize: 11 }} onClick={() => go('providers')}>Add one</Btn>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {provs.map(([uuid, p]) => <KeyRow key={uuid} uuid={uuid} p={p} state={state} />)}
        </div>
      )}

      <Rule />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--c-muted)' }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <I.Lock size={12} />
          Stored by VS Code <span className="mono">SecretStorage</span>, never in{' '}
          <span className="mono">settings.json</span>
        </span>
        <span>Validity is inferred from real responses — no key is ever sent to test it</span>
      </div>
      {(stored > 0 || missing > 0) && (
        <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>
          {stored} stored{missing > 0 && `, ${missing} missing`}
        </div>
      )}
    </div>
  );
}

function KeyRow({ uuid, p, state }: { uuid: string; p: ProviderCfg; state: AppState }) {
  const [entering, setEntering] = useState(false);
  const [draft, setDraft] = useState('');
  const has = state.keys[uuid];
  const h = state.health[uuid];
  const rejected = Boolean(h?.authFailedAt);
  const hiddenModels = modelsFor(state, uuid).length;

  const commit = () => {
    if (draft.trim()) actions.setApiKey(uuid, draft.trim());
    setDraft('');
    setEntering(false);
  };

  if (!has && !entering) {
    return (
      <div className="krow" style={{ borderStyle: 'dashed' }}>
        <span className="prov-mark" style={{ opacity: .5 }}>{mark(p)}</span>
        <span className="prov-n" style={{ width: 140, flex: 'none' }}>
          <span className="a">{p.name || p.family}</span>
          <span className="b">{_local(p) ? 'no key needed' : 'no key'}</span>
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>
          {_local(p)
            ? 'Local endpoint — nothing to store'
            : `${hiddenModels} model${hiddenModels === 1 ? '' : 's'} stay hidden from the picker until this is set`}
        </span>
        {!_local(p) && (
          <Btn variant="pri" style={{ marginLeft: 'auto', height: 24, fontSize: 11 }}
            onClick={() => setEntering(true)}>Add key</Btn>
        )}
      </div>
    );
  }

  return (
    <div className="krow" style={rejected ? { borderColor: 'rgba(239,68,68,.4)' } : undefined}>
      <span className="prov-mark">{mark(p)}</span>
      <span className="prov-n" style={{ width: 140, flex: 'none' }}>
        <span className="a">{p.name || p.family}</span>
        <span className="b">{h?.checkedAt ? _ago(h.checkedAt) : 'not checked'}</span>
      </span>

      {entering ? (
        <div className="inp mono" style={{ flex: 1, height: 26 }}>
          <input
            type="password"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEntering(false); }}
            placeholder="paste the key, then press Enter"
            aria-label={`API key for ${p.name || p.family}`}
          />
        </div>
      ) : (
        <>
          <span className="msk">{'•'.repeat(18)}</span>
          {rejected
            ? <Chip tone="err" dot>Rejected at {_clock(h!.authFailedAt!)}</Chip>
            : h?.reachable
              ? <Chip tone="ok" dot>Reachable{h.ms !== undefined && ` · ${h.ms} ms`}</Chip>
              : <Chip tone="mute" dot>Not checked</Chip>}
        </>
      )}

      <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
        {entering ? (
          <>
            <Btn variant="pri" style={{ height: 24, fontSize: 11 }} onClick={commit}>Save</Btn>
            <Btn style={{ height: 24, fontSize: 11 }} onClick={() => setEntering(false)}>Cancel</Btn>
          </>
        ) : (
          <>
            {rejected && (
              <Btn style={{ height: 24, fontSize: 11 }} onClick={() => setEntering(true)}>Replace key</Btn>
            )}
            {!rejected && (
              <IconBtn icon={<I.Refresh />} label={`Replace key for ${p.name || p.family}`} ghost
                onClick={() => setEntering(true)} />
            )}
            <IconBtn icon={<I.Trash />} label={`Remove key for ${p.name || p.family}`} ghost
              onClick={() => actions.clearApiKey(uuid)} />
          </>
        )}
      </span>
    </div>
  );
}

function _local(p: ProviderCfg): boolean {
  return /localhost|127\.0\.0\.1/.test(p.baseUrl);
}

function _store(): string {
  const p = navigator.platform ?? '';
  if (/Mac/i.test(p)) return 'macOS Keychain';
  if (/Win/i.test(p)) return 'Windows Credential Manager';
  return 'libsecret';
}

function _clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function _ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'checked just now';
  if (mins < 60) return `checked ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `checked ${hrs}h ago`;
  return `checked ${Math.round(hrs / 24)}d ago`;
}
