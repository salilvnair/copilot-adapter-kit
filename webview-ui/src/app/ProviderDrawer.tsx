/* Add / edit provider — the mock's right-hand drawer.
 *
 * Test runs before Save, and its result is shown in the drawer: a base URL that
 * cannot be reached is the single most common reason a provider never works,
 * and finding that out after saving wastes a round trip through the picker. */

import { SelectInputView } from '@salilvnair/dui';
import { useEffect, useState } from 'react';
import * as I from '../icons';
import { Btn, CloseBtn, Field } from '../ui';
import { actions, shortUrl, type AppState, type ProviderCfg } from './state';

interface Probe {
  state: 'idle' | 'running' | 'ok' | 'fail';
  ms?: number;
  models?: number;
  message?: string;
}

export function AddProviderDrawer({
  state, uuid, close,
}: {
  state: AppState;
  uuid?: string;
  close: () => void;
}) {
  const existing: ProviderCfg | undefined = uuid ? state.providers[uuid] : undefined;

  const [family, setFamily] = useState(existing?.family ?? state.engineFamilies[0]?.family ?? 'openai');
  const [name, setName] = useState(existing?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [aliases, setAliases] = useState(_aliasText(existing?.modelAlias));
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });

  const fam = state.engineFamilies.find(f => f.family === family);

  /*
    Picking a family fills the endpoint, unless the user has typed their own.

    This only filled an EMPTY field, so the first family's URL stuck: the drawer
    opens on OpenAI and fills api.openai.com, then switching to DeepSeek left
    that URL sitting there — pointing the new provider at the wrong service.
    A URL that is still some family's default was put there by this effect, so
    it is ours to replace; anything else is yours and is left alone.
  */
  const DEFAULTS = new Set(state.engineFamilies.map(f => f.defaultUrl).filter(Boolean));
  useEffect(() => {
    if (existing || !fam) return;
    setBaseUrl(prev => (!prev || DEFAULTS.has(prev) ? fam.defaultUrl : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, fam, existing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const save = () => {
    if (!baseUrl.trim()) return;
    // A new provider gets its id here rather than on the host, so the key typed
    // beside it has something to attach to. It used to be saved only when a
    // uuid already existed, which meant the key was silently dropped every time
    // a provider was added with one — the commonest way to add one at all.
    const id = uuid || _uuid();
    actions.saveProvider(id, {
      family,
      name: name.trim() || fam?.label || family,
      baseUrl: baseUrl.trim(),
      modelAlias: _parseAliases(aliases),
    });
    if (apiKey.trim()) actions.setApiKey(id, apiKey.trim());
    close();
  };

  const test = async () => {
    setProbe({ state: 'running' });
    const started = Date.now();
    try {
      // No key attached, exactly as the Providers screen promises.
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, { method: 'GET' });
      const ms = Date.now() - started;
      let models: number | undefined;
      try {
        const body = await res.json();
        if (Array.isArray(body?.data)) models = body.data.length;
      } catch { /* an endpoint that answers at all is reachable */ }
      setProbe({ state: 'ok', ms, models });
    } catch (e) {
      setProbe({ state: 'fail', message: (e as Error).message });
    }
  };

  return (
    <aside className="drawer in-split" role="dialog" aria-label={existing ? 'Edit provider' : 'Add provider'}>
      <div className="drawer-h">
        {existing ? <I.Pencil size={14} /> : <I.Plus size={14} width={2.2} />}
        {existing ? 'Edit provider' : 'Add provider'}
        <span style={{ marginLeft: 'auto' }}>
          <CloseBtn onClick={close} />
        </span>
      </div>

      <div className="drawer-b">
        <Field label="Family">
          {/* dui's select, not the platform's: a native <select> opens an OS menu
              that cannot take the editor's theme, which is what it looked like. */}
          <SelectInputView
            testId="provider-family"
            value={family}
            onChange={setFamily}
            options={state.engineFamilies.map(f => ({
              value: f.family,
              label: f.label,
              badge: { label: (f.family.slice(0, 2) || '??').toUpperCase(), color: 'var(--c-primary)' },
            }))}
            size="md"
            menuMinWidth={240}
          />
        </Field>

        <Field label="Name">
          <div className="inp">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder={fam?.label ?? 'My provider'} aria-label="Provider name" />
          </div>
        </Field>

        <Field label="Base URL">
          <div className={`inp mono${baseUrl ? ' focus' : ''}`} style={{ fontSize: 11.5 }}>
            <input value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setProbe({ state: 'idle' }); }}
              placeholder="https://api.example.com/v1" aria-label="Base URL" />
          </div>
        </Field>

        <Field label="API key">
          <div className="inp ph">
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={uuid && state.keys[uuid] ? '•••••••••• stored' : 'paste your key'}
              aria-label="API key" />
            <span style={{ marginLeft: 'auto', display: 'flex' }}><I.Eye size={12} /></span>
          </div>
        </Field>

        <Field label={<>Aliases <span style={{ textTransform: 'none', letterSpacing: 0 }}>optional</span></>}>
          <div className="inp ph">
            <input value={aliases} onChange={e => setAliases(e.target.value)}
              placeholder="pickerId = apiName" aria-label="Model aliases" />
          </div>
        </Field>

        {probe.state === 'ok' && (
          <div style={{
            border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.08)',
            borderRadius: 8, padding: '9px 11px', display: 'flex', gap: 9, alignItems: 'center',
          }}>
            <span style={{ color: 'var(--c-success)', display: 'flex' }}><I.Check size={14} width={2.4} /></span>
            <span style={{ fontSize: 11.5 }}>
              Reached in <b className="mono">{probe.ms} ms</b>
              {probe.models !== undefined && <> · {probe.models} models offered</>}
            </span>
          </div>
        )}
        {probe.state === 'fail' && (
          <div style={{
            border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.07)',
            borderRadius: 8, padding: '9px 11px', display: 'flex', gap: 9, alignItems: 'flex-start',
          }}>
            <span style={{ color: 'var(--c-error)', display: 'flex', marginTop: 1 }}><I.Error size={14} /></span>
            <span style={{ fontSize: 11.5, lineHeight: 1.5 }}>
              <b style={{ color: 'var(--c-error)' }}>Could not reach {shortUrl(baseUrl)}</b><br />
              <span style={{ color: 'var(--c-muted)' }}>Check the URL and that the service is running.</span>
            </span>
          </div>
        )}
      </div>

      <div className="drawer-f">
        <Btn icon={<I.Refresh size={12} />} onClick={test} disabled={!baseUrl.trim() || probe.state === 'running'}>
          {probe.state === 'running' ? 'Testing…' : 'Test'}
        </Btn>
        <Btn variant="pri" style={{ marginLeft: 'auto' }} onClick={save} disabled={!baseUrl.trim()}>
          Save provider
        </Btn>
      </div>
    </aside>
  );
}

function _aliasText(map: Record<string, string> | undefined): string {
  if (!map) return '';
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join(', ');
}

function _parseAliases(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.split(',')) {
    const [k, ...v] = pair.trim().split('=');
    if (k?.trim() && v.length) out[k.trim()] = v.join('=').trim();
  }
  return out;
}

/** Same shape the host generates, so either side may mint one. */
function _uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
