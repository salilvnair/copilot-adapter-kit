/* Ctrl+K — one search across providers, models, settings and actions.
 *
 * Settings are findable by what they do, not by which screen they were filed
 * under, which is the whole point of having it. */

import { useMemo, useState } from 'react';
import * as I from '../icons';
import { actions, liveProviders, modelsFor, type AppState } from './state';
import type { Route } from './Shell';

const GROUP_ORDER = ['Providers', 'Models', 'Settings', 'Actions'] as const;

interface Entry {
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  danger?: boolean;
  run: () => void;
}

export function CommandPalette({
  state, close, go,
}: {
  state: AppState;
  close: () => void;
  go: (r: Route) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const [uuid, p] of liveProviders(state)) {
      out.push({
        group: 'Providers',
        label: p.name || p.family || uuid,
        hint: p.baseUrl.replace(/^https?:\/\//, ''),
        icon: <I.Globe size={14} width={1.9} />,
        run: () => go('providers'),
      });
      for (const m of modelsFor(state, uuid)) {
        out.push({
          group: 'Models',
          label: m.name || m.id,
          hint: m.id,
          icon: <I.Grid size={14} />,
          run: () => go('models'),
        });
      }
    }
    out.push(
      { group: 'Settings', label: 'Daily token limit', hint: 'Spend Guard', icon: <I.Shield size={14} width={1.9} />, run: () => go('guard') },
      { group: 'Settings', label: 'Daily cost limit', hint: 'Spend Guard', icon: <I.Shield size={14} width={1.9} />, run: () => go('guard') },
      { group: 'Settings', label: 'Turns per conversation', hint: 'Spend Guard', icon: <I.Shield size={14} width={1.9} />, run: () => go('guard') },
      { group: 'Actions', label: 'Open spend history', icon: <I.Chart size={14} />, run: actions.openSpendGuard },
      { group: 'Actions', label: 'Check every provider', icon: <I.Refresh size={14} />, run: actions.testAllProviders },
      { group: 'Actions', label: 'Open settings.json', icon: <I.Braces size={14} />, run: actions.openSettings },
    );
    return out;
  }, [state, go]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries.slice(0, 12);
    return entries
      .filter(e => e.label.toLowerCase().includes(needle) || (e.hint ?? '').toLowerCase().includes(needle))
      .slice(0, 12);
  }, [entries, q]);

  // Entries are built provider-by-provider, so a model sits between two
  // providers. Collect by group instead of by adjacency, or the same header
  // repeats down the list.
  const grouped: [string, Entry[]][] = GROUP_ORDER
    .map(g => [g, hits.filter(e => e.group === g)] as [string, Entry[]])
    .filter(([, items]) => items.length > 0);

  const fire = (e: Entry | undefined) => { if (e) { e.run(); close(); } };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        display: 'flex', justifyContent: 'center', paddingTop: '14vh', zIndex: 40,
      }}
      onClick={close}
    >
      <div className="kpal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="kpal-in">
          <I.Search size={14} />
          <input
            autoFocus
            value={q}
            onChange={e => { setQ(e.target.value); setSel(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, hits.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
              if (e.key === 'Enter') fire(hits[sel]);
            }}
            placeholder="Search providers, models, settings"
            aria-label="Search"
          />
          <span className="kbd" style={{ marginLeft: 'auto' }}><span>Esc</span></span>
        </div>

        {hits.length === 0 && (
          <div style={{ padding: '14px', fontSize: 12, color: 'var(--c-muted)' }}>Nothing matches “{q}”.</div>
        )}

        {grouped.map(([group, items]) => (
          <div key={group}>
            <div className="pgrp">{group}</div>
            {items.map(e => {
              const idx = hits.indexOf(e);
              return (
                <button
                  key={group + e.label + idx}
                  type="button"
                  className={`kpal-row${idx === sel ? ' on' : ''}`}
                  style={e.danger ? { color: 'var(--c-error)' } : undefined}
                  onMouseEnter={() => setSel(idx)}
                  onClick={() => fire(e)}
                >
                  {e.icon}
                  {e.label}
                  {e.hint && <span className="hint">{e.hint}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
