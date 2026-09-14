/* Audit log — one row per model call, and one per action taken in the panel.
 *
 * Same shape as daakia's: a compact toolbar with a filter and a live count, a
 * dense table colour-coded by module, and a row that expands into the whole
 * record. The question it exists to answer is "why did this behave differently
 * to yesterday", which a list of timestamps cannot answer on its own.
 *
 * Bodies are only present when audit.recordBodies is on. For this extension the
 * payload is your source, so the default is off and the screen says so rather
 * than showing empty panels with no explanation. */

import { useMemo, useState } from 'react';
import * as I from '../../icons';
import { Btn, Chip, IconBtn, PageHead, Segmented } from '../../ui';
import { Confirm } from '../../ui/Confirm';
import { actions, fmtTokens, type AppState, type AuditRow, type UiAuditRow } from '../state';

type Kind = 'all' | 'ai' | 'ui';

/** Colour per stage family, so a scan down the table groups without reading. */
const STAGE_TONE: Record<string, string> = {
  'chat.complete': 'var(--c-success)',
  'chat.refused': 'var(--c-error)',
  'chat.error': 'var(--c-error)',
  'git.commit': 'var(--c-primary)',
  'vision.describe': 'var(--c-info)',
};

const STAGE_LABEL: Record<string, string> = {
  'chat.complete': 'complete',
  'chat.refused': 'refused',
  'chat.error': 'error',
  'git.commit': 'commit',
  'vision.describe': 'vision',
};

export function AuditLog({ state }: { state: AppState }) {
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const audit = state.audit;
  const rows = useMemo(() => {
    const ai = (audit?.ai ?? []).map(r => ({ ...r, kind: 'ai' as const }));
    const ui = (audit?.ui ?? []).map(r => ({ ...r, kind: 'ui' as const }));
    const all = kind === 'ai' ? ai : kind === 'ui' ? ui : [...ai, ...ui];
    all.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  }, [audit, kind, search]);

  const total = (audit?.ai.length ?? 0) + (audit?.ui.length ?? 0);

  if (!audit?.ok) {
    return (
      <div className="set-main">
        <PageHead title="Audit log" sub="unavailable" />
        <div style={{
          border: '1px solid rgba(245,158,11,.35)', background: 'rgba(245,158,11,.08)',
          borderRadius: 9, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'flex-start',
        }}>
          <span style={{ color: 'var(--c-warning)', display: 'flex', marginTop: 1 }}><I.Warning size={14} /></span>
          <span style={{ fontSize: 11.5, lineHeight: 1.55 }}>
            <b>SQLite did not start.</b><br />
            <span style={{ color: 'var(--c-muted)' }}>
              {audit?.error ?? 'The database could not be opened.'} Everything else keeps working;
              only the audit log is affected.
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="set-main">
      <PageHead
        title="Audit log"
        sub={`${audit.counts.ai} calls · ${audit.counts.ui} actions`}
        right={
          <>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: 'All' },
                { value: 'ai', label: 'Calls' },
                { value: 'ui', label: 'Actions' },
              ]}
            />
            <label className="search-f">
              <I.Search size={12} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter by model, stage, action…"
                aria-label="Filter the audit log"
              />
              {search
                ? <button type="button" className="cak-count" onClick={() => setSearch('')} aria-label="Clear filter">
                    <I.Close size={9} />
                  </button>
                : <span className="cak-count mono">{rows.length}</span>}
            </label>
            <IconBtn icon={<I.Refresh />} label="Reload" onClick={actions.loadAudit} />
            <IconBtn icon={<I.Download />} label="Export as JSON" onClick={actions.exportAudit} />
            <IconBtn icon={<I.Trash />} label="Clear the audit log" onClick={() => setConfirmClear(true)} />
          </>
        }
      />

      {!audit.recordBodies && (
        <div className="audit-note">
          <span style={{ display: 'flex', marginTop: 2 }}><I.Info size={12} /></span>
          <span>
            Prompts and responses are not recorded. The payload here is your source code, so it
            stays off unless you ask for it.
          </span>
          <Btn style={{ height: 22, fontSize: 10.5 }}
            onClick={() => actions.saveConfig('audit.recordBodies', true)}>
            Record bodies
          </Btn>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--c-muted)', padding: '10px 0' }}>
          {total === 0
            ? 'Nothing recorded yet — model calls and panel actions appear here.'
            : 'No matches.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="dtbl audit">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th style={{ width: 74 }}>Kind</th>
                <th style={{ width: 92 }}>Stage</th>
                <th style={{ width: 150 }}>Model / action</th>
                <th>Detail</th>
                <th className="num" style={{ width: 74 }}>Tokens</th>
                <th className="num" style={{ width: 62 }}>Cost</th>
                <th className="num" style={{ width: 62 }}>Took</th>
                <th style={{ width: 82 }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const key = r.kind === 'ai' ? `ai-${r.audit_id}` : `ui-${r.id}`;
                const open = expanded === key;
                return (
                  <Row
                    key={key}
                    row={r}
                    number={rows.length - i}
                    open={open}
                    onToggle={() => setExpanded(open ? null : key)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Confirm
        open={confirmClear}
        title="Clear the audit log?"
        message={`Every one of the ${total} entries recorded so far is removed and cannot be recovered. The log is what answers questions after the fact.`}
        confirmLabel={total ? `Clear ${total} entries` : 'Clear'}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); actions.clearAudit(); }}
      />
    </div>
  );
}

/* ── Row ──────────────────────────────────────────────────────────────── */

type Row = (AuditRow & { kind: 'ai' }) | (UiAuditRow & { kind: 'ui' });

function Row({ row, number, open, onToggle }: { row: Row; number: number; open: boolean; onToggle: () => void }) {
  const ai = row.kind === 'ai' ? row : undefined;
  const ui = row.kind === 'ui' ? row : undefined;
  const stage = ai?.stage ?? ui?.event_type ?? '';
  const tone = STAGE_TONE[stage] ?? 'var(--c-muted)';
  const label = STAGE_LABEL[stage] ?? stage.split('.').pop() ?? stage;
  const tokens = (ai?.input_tokens ?? 0) + (ai?.output_tokens ?? 0);

  return (
    <>
      <tr className={`audit-row${open ? ' is-open' : ''}`} onClick={onToggle}
        style={open ? { background: `color-mix(in srgb, ${tone} 7%, transparent)` } : undefined}>
        <td className="mono" style={{ color: 'var(--c-muted)' }}>{number}</td>
        <td>
          <Chip tone={ai ? 'pri' : 'mute'} style={{ height: 17, fontSize: 9.5 }}>
            {ai ? 'call' : 'action'}
          </Chip>
        </td>
        <td>
          <span className="audit-stage" style={{ color: tone, borderColor: `color-mix(in srgb, ${tone} 35%, transparent)` }}>
            {label}
          </span>
        </td>
        <td className="mono" style={{ fontSize: 10.5 }}>{ai?.model ?? ui?.module ?? '—'}</td>
        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ai?.error
            ? <span style={{ color: 'var(--c-error)' }}>{ai.error}</span>
            : ai
              ? (ai.user_prompt?.slice(0, 90) ?? _metaSummary(ai.meta))
              : (ui?.action ?? ui?.button ?? ui?.event_type)}
        </td>
        <td className="num mono">{ai ? fmtTokens(tokens) : '—'}</td>
        <td className="num mono">{ai?.cost_usd ? `$${ai.cost_usd.toFixed(3)}` : '—'}</td>
        <td className="num mono">{ai?.duration_ms != null ? `${ai.duration_ms}ms` : '—'}</td>
        <td className="mono" style={{ fontSize: 10 }}>{_clock(row.created_at)}</td>
      </tr>

      {open && (
        <tr className="audit-detail">
          <td colSpan={9}>
            <div className="audit-panels">
              <Panel title="Record">
                <KeyValues rows={_summary(row)} />
              </Panel>
              {ai?.system_prompt && <Panel title="System prompt"><Body text={ai.system_prompt} /></Panel>}
              {ai?.user_prompt && <Panel title="User prompt"><Body text={ai.user_prompt} /></Panel>}
              {ai?.response_payload && <Panel title="Response"><Body text={ai.response_payload} /></Panel>}
              {ai?.meta && <Panel title="Meta"><Body text={_pretty(ai.meta)} /></Panel>}
              {ui?.metadata && <Panel title="Metadata"><Body text={_pretty(ui.metadata)} /></Panel>}
              {ai && !ai.system_prompt && !ai.user_prompt && (
                <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <I.Info size={11} />
                  Bodies were not recorded for this call.
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="audit-panel">
      <div className="audit-panel__h">{title}</div>
      {children}
    </div>
  );
}

function Body({ text }: { text: string }) {
  return <pre className="audit-body mono">{text}</pre>;
}

function KeyValues({ rows }: { rows: [string, string][] }) {
  return (
    <div className="audit-kv">
      {rows.map(([k, v]) => (
        <div key={k}><span className="k">{k}</span><span className="v mono">{v}</span></div>
      ))}
    </div>
  );
}

function _summary(row: Row): [string, string][] {
  if (row.kind === 'ui') {
    return [
      ['Event', row.event_type],
      ['Module', row.module],
      ['Action', row.action ?? '—'],
      ['At', row.created_at],
    ];
  }
  return [
    ['Conversation', row.conversation_id],
    ['Provider', row.provider ?? '—'],
    ['Model', row.model ?? '—'],
    ['Input', row.input_tokens != null ? fmtTokens(row.input_tokens) : '—'],
    ['Output', row.output_tokens != null ? fmtTokens(row.output_tokens) : '—'],
    ['Cost', row.cost_usd ? `$${row.cost_usd.toFixed(4)}` : 'no pricing set'],
    ['Duration', row.duration_ms != null ? `${row.duration_ms} ms` : '—'],
    ['At', row.created_at ?? '—'],
  ];
}

function _metaSummary(meta?: string): string {
  try {
    const m = JSON.parse(meta ?? '{}');
    return `${m.messages ?? 0} messages · ${m.tools ?? 0} tools`;
  } catch {
    return '—';
  }
}

function _pretty(json: string): string {
  try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return json; }
}

function _clock(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
