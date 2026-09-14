/* Shell — top bar, rail and routing.
 *
 * Markup follows the approved mock exactly: .set-top, .set-shell, .set-rail,
 * .set-main. Destinations not yet built render the Coming screen rather than
 * disappearing from the rail, so the shape of the product stays visible. */

import { useEffect, useState } from 'react';
import * as I from '../icons';
import { Chip, IconBtn } from '../ui';
import { Menu } from '../ui/Menu';
import { CommandPalette } from './CommandPalette';
import { Keys } from './screens/Keys';
import { Models } from './screens/Models';
import { Providers } from './screens/Providers';
import { AuditLog } from './screens/AuditLog';
import { Configuration } from './screens/Configuration';
import { GitTools } from './screens/GitTools';
import { SpendGuard } from './screens/SpendGuard';
import { Bin, Danger, DevTools, Dumps, JsonSettings } from './screens/Workspace';
import { actions, liveProviders, useAppState, type AppState } from './state';
import { onThemeMode, setThemeMode, themeMode, type ThemeMode } from '../vscode';

export type Route =
  | 'providers' | 'models' | 'keys'
  | 'guard'
  | 'config' | 'git' | 'json' | 'dumps' | 'audit' | 'dev'
  | 'bin' | 'danger';

export function Shell() {
  const state = useAppState();
  const [route, setRoute] = useState<Route>('providers');
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(p => !p);
      }
      if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return <div className="pane" />;

  return (
    <>
      {state.isSample && (
        <div className="fixture-bar">
          <I.Warning size={12} />
          Sample data — this page is running outside VS Code, so none of these figures are yours.
        </div>
      )}
      <TopBar state={state} onSearch={() => setPalette(true)} />
      <div className="set-shell stage-wrap">
        <Rail state={state} route={route} go={setRoute} />
        <Screen state={state} route={route} go={setRoute} />
      </div>
      {palette && <CommandPalette state={state} close={() => setPalette(false)} go={setRoute} />}
    </>
  );
}

/* ── Top bar ──────────────────────────────────────────────────────────── */

function TopBar({ state, onSearch }: { state: AppState; onSearch: () => void }) {
  const b = state.budget;
  const pct = b && b.tokenPct >= 0 ? Math.round(Math.max(b.tokenPct, b.costPct)) : undefined;
  const tone = !b?.caps.enforce ? 'err' : b?.overLimit ? 'err' : b?.nearLimit ? 'warn' : 'ok';

  return (
    <div className="set-top">
      <span className="set-brand">
        <span className="set-logo"><I.Shield size={13} width={2.2} /></span>
        Copilot Adapter Kit
        {state.version && (
          <Chip tone="mute" mono style={{ height: 18, fontSize: 10 }}>{state.version}</Chip>
        )}
      </span>

      <button type="button" className="omni" onClick={onSearch}>
        <I.Search size={12} />
        Search providers, models, settings
        <span className="kbd"><span>Ctrl</span><span>K</span></span>
      </button>

      <span className="right">
        {b && (
          <Chip tone={tone} dot>
            {b.caps.enforce ? `Guard ${pct ?? 0}%` : 'UNCAPPED'}
          </Chip>
        )}
        <ThemeToggle />
        <Menu
          label="More"
          align="right"
          items={[
            {
              id: 'probe',
              label: 'Check every provider',
              icon: <I.Refresh size={13} />,
              onClick: actions.testAllProviders,
            },
            {
              id: 'guard',
              label: 'Open Spend Guard',
              icon: <I.Shield size={13} width={1.9} />,
              onClick: actions.openSpendGuard,
            },
            { id: 'sep', label: '', separator: true },
            {
              id: 'json',
              label: 'Open settings.json',
              description: 'The same values, written out',
              icon: <I.Braces size={13} />,
              onClick: actions.openSettings,
            },
          ]}
        />
      </span>
    </div>
  );
}

/** Auto → Light → Dark. Auto follows the editor, which is the default. */
function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(themeMode);

  useEffect(() => onThemeMode(setMode), []);

  const next: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };
  const icon = mode === 'light' ? <I.Sun size={14} />
    : mode === 'dark' ? <I.Moon size={14} />
      : <I.Auto size={14} />;
  const label = mode === 'auto' ? 'Theme: following the editor'
    : mode === 'light' ? 'Theme: light' : 'Theme: dark';

  return (
    <IconBtn
      icon={icon}
      label={`${label} — click for ${next[mode]}`}
      ghost
      on={mode !== 'auto'}
      onClick={() => setThemeMode(next[mode])}
    />
  );
}

/* ── Rail ─────────────────────────────────────────────────────────────── */

function Rail({ state, route, go }: { state: AppState; route: Route; go: (r: Route) => void }) {
  const provs = liveProviders(state);
  const modelCount = Object.values(state.models)
    .flat()
    .filter(m => m && !m._deleted).length;
  const keyCount = Object.values(state.keys).filter(Boolean).length;
  const b = state.budget;
  const guardPct = b && b.tokenPct >= 0 ? `${Math.round(Math.max(b.tokenPct, b.costPct))}%` : undefined;

  const item = (r: Route, icon: React.ReactNode, label: string, count?: React.ReactNode, tone?: 'ok' | 'hot') => (
    <button
      type="button"
      className={`rail-item${route === r ? ' on' : ''}`}
      onClick={() => go(r)}
      aria-current={route === r ? 'page' : undefined}
    >
      {icon}
      {label}
      {count !== undefined && <span className={`ct${tone ? ' ' + tone : ''}`}>{count}</span>}
    </button>
  );

  return (
    <nav className="set-rail">
      <div className="rail-grp">Connections</div>
      {item('providers', <I.Globe size={15} />, 'Providers', provs.length)}
      {item('models', <I.Grid size={15} />, 'Models', modelCount)}
      {item('keys', <I.Key size={15} />, 'API Keys', keyCount, keyCount > 0 ? 'ok' : undefined)}

      <div className="rail-grp">Guard</div>
      {item('guard', <I.Shield size={15} />, 'Spend Guard', guardPct,
        b?.caps.enforce === false ? 'hot' : 'ok')}

      <div className="rail-grp">Workspace</div>
      {item('config', <I.Sliders size={15} />, 'Configuration')}
      {item('git', <I.Branch size={15} />, 'Git Tools')}
      {item('json', <I.Braces size={15} />, 'JSON Settings')}
      {item('dumps', <I.Folder size={15} />, 'Request Dumps')}
      {item('audit', <I.Chart size={15} />, 'Audit Log', _auditCount(state))}
      {item('dev', <I.Braces size={15} />, 'Dev Tools')}

      <div className="rail-foot">
        {item('bin', <I.Trash size={15} />, 'Bin', _binCount(state))}
        <button
          type="button"
          className={`rail-item${route === 'danger' ? ' on' : ''}`}
          style={{ color: 'var(--c-error)' }}
          onClick={() => go('danger')}
        >
          <I.Warning size={15} width={1.8} />
          Danger Zone
        </button>
      </div>
    </nav>
  );
}

function _auditCount(state: AppState): number | undefined {
  const a = state.audit;
  if (!a?.ok) return undefined;
  return a.counts.ai + a.counts.ui;
}

function _binCount(state: AppState): number {
  const provs = Object.values(state.providers).filter(p => p?._deleted).length;
  const models = Object.values(state.models).flat().filter(m => m?._deleted).length;
  return provs + models;
}

/* ── Routing ──────────────────────────────────────────────────────────── */

function Screen({ state, route, go }: { state: AppState; route: Route; go: (r: Route) => void }) {
  switch (route) {
    case 'providers':
      return <Providers state={state} go={go} />;
    case 'models':
      return <Models state={state} />;
    case 'keys':
      return <Keys state={state} go={go} />;
    case 'guard':
      return <SpendGuard state={state} />;
    case 'config':
      return <Configuration state={state} />;
    case 'git':
      return <GitTools state={state} />;
    case 'json':
      return <JsonSettings state={state} />;
    case 'dumps':
      return <Dumps state={state} />;
    case 'audit':
      return <AuditLog state={state} />;
    case 'dev':
      return <DevTools state={state} />;
    case 'bin':
      return <Bin state={state} />;
    case 'danger':
      return <Danger state={state} />;
  }
}
