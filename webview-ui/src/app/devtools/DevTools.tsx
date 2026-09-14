/**
 * Developer Tools — the same three tabs daakia has, in the same order.
 *
 * Audit Log is what happened, Audit Config decides what gets written down, and
 * DB Explorer is the store underneath both. They belong together: the first
 * question anyone asks of a log is "why is this row here / why is it not".
 */
import { TabView, type TabItem } from '@salilvnair/dui';
import { useState } from 'react';
import { installDevToolsFixture } from './dev-fixture';
import { AuditConfigTab } from './AuditConfigTab';
import { AuditLogTab } from './AuditLogTab';
import { DbExplorerTab } from './DbExplorerTab';
import type { AppState } from '../state';
import * as I from '../../icons';

// Outside VS Code there is no database to answer these tabs, so the dev server
// stands in. This runs at module load rather than in an effect, because a
// child's effect fires before its parent's — the tabs ask for their data before
// a listener installed here would exist. `import.meta.env.DEV` is replaced by
// `false` in a production build, so the call and the module are dropped.
if (import.meta.env.DEV) installDevToolsFixture();

type DevToolsSubtab = 'audit' | 'audit-config' | 'db';

const DEVTOOLS_TABS: { id: DevToolsSubtab; label: string }[] = [
  { id: 'audit',        label: 'Audit Log' },
  { id: 'audit-config', label: 'Audit Config' },
  { id: 'db',           label: 'DB Explorer' },
];

const PREF = 'cak.devtools.subtab';
const read = (): DevToolsSubtab => {
  try { return (localStorage.getItem(PREF) as DevToolsSubtab) || 'audit'; } catch { return 'audit'; }
};

export function DevTools({ state }: { state: AppState }) {
  const [active, setActive] = useState<DevToolsSubtab>(read);

  const pick = (t: DevToolsSubtab) => {
    setActive(t);
    try { localStorage.setItem(PREF, t); } catch { /* private window */ }
  };

  // Every tab here reads the database; without it there is nothing to show, and
  // saying so once beats three tabs each failing in their own way.
  if (state.audit && !state.audit.ok) {
    return (
      <div className="set-main-bleed flex flex-col min-h-0 overflow-hidden items-center justify-center gap-2 px-8">
        <div style={{
          border: '1px solid rgba(245,158,11,.35)', background: 'rgba(245,158,11,.08)',
          borderRadius: 9, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'flex-start', maxWidth: 520,
        }}>
          <span style={{ color: 'var(--color-warning)', display: 'flex', marginTop: 1 }}><I.Warning size={14} /></span>
          <span style={{ fontSize: 11.5, lineHeight: 1.55 }}>
            <b>SQLite did not start.</b><br />
            <span style={{ color: 'var(--color-text-muted)' }}>
              {state.audit.error ?? 'The database could not be opened.'} Everything else
              keeps working; only Developer Tools is affected.
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="set-main-bleed flex flex-col min-h-0 overflow-hidden">
      {/* Sub-tab bar */}
      <div className="px-3 pt-2 pb-0 border-b border-[var(--color-surface-border)] shrink-0">
        <TabView
          tabs={DEVTOOLS_TABS as TabItem[]}
          activeTab={active}
          onChange={t => pick(t as DevToolsSubtab)}
          variant="underline"
          size="sm"
          accentColor="var(--color-primary)"
        />
      </div>
      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {active === 'audit' && <AuditLogTab />}
        {active === 'audit-config' && <AuditConfigTab />}
        {active === 'db' && <DbExplorerTab />}
      </div>
    </div>
  );
}
