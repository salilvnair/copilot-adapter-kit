/**
 * AuditLogTab — Developer Tools: Audit Log
 * Unified log: model calls (cak_audit) + UI events (ui_audit).
 * Module-correct color coding per module + Module badge column.
 *
 * Ported from daakia. The columns, the badges, the expanded record and the
 * toolbar are the same; what differs is the taxonomy, because the modules here
 * are providers, models, keys and a budget rather than protocols.
 */
import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { ModalView, ButtonView } from '@salilvnair/dui';
import { CodeEditor, type CodeLanguage } from '../../ui/CodeEditor';
import { post } from '../../vscode';
import * as I from '../../icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CakAuditEntry {
  kind: 'ai';
  audit_id: number;
  conversation_id: string;
  stage: string;
  provider?: string;
  model?: string;
  user_prompt?: string;
  system_prompt?: string;
  request_payload?: string;
  response_payload?: string;
  headers?: string;
  meta?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  duration_ms?: number;
  error?: string;
  created_at: string;
}

interface UiAuditEntry {
  kind: 'ui';
  audit_id: number;
  event_type: string;
  module: string;
  button?: string;
  action?: string;
  metadata?: string;
  created_at: string;
}

type AnyAuditEntry = CakAuditEntry | UiAuditEntry;

// ─── Module info ──────────────────────────────────────────────────────────────

interface ModuleInfo { label: string; color: string }

const MODULE_MAP: Record<string, ModuleInfo> = {
  'Providers':   { label: 'Providers',   color: 'var(--color-primary)' },
  'Models':      { label: 'Models',      color: '#818cf8' },
  'API Keys':    { label: 'API Keys',    color: '#f59e0b' },
  'Spend Guard': { label: 'Spend Guard', color: 'var(--color-success)' },
  'Workspace':   { label: 'Workspace',   color: 'var(--color-info)' },
  'Git Tools':   { label: 'Git Tools',   color: '#a78bfa' },
  'Audit':       { label: 'Audit',       color: '#06b6d4' },
  'Dev Tools':   { label: 'Dev Tools',   color: 'var(--color-settings)' },
  'Danger Zone': { label: 'Danger Zone', color: 'var(--color-error)' },
  'Status Bar':  { label: 'Status Bar',  color: 'var(--color-text-secondary)' },
  // Written by the host before the taxonomy above existed.
  'providers':   { label: 'Providers',   color: 'var(--color-primary)' },
  'core':        { label: 'Core',        color: 'var(--color-text-secondary)' },
  'status':      { label: 'Status Bar',  color: 'var(--color-text-secondary)' },
};

/** A model call's module comes from its stage, the way a UI event's is its own. */
function moduleFromStage(stage: string): ModuleInfo {
  if (stage.startsWith('chat.'))   return { label: 'Chat', color: 'var(--color-primary)' };
  if (stage.startsWith('git.'))    return MODULE_MAP['Git Tools']!;
  if (stage.startsWith('vision.')) return { label: 'Vision', color: 'var(--color-info)' };
  return { label: 'Model', color: 'var(--color-text-muted)' };
}

// ─── Stage label map ──────────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  'chat.complete':   'complete',
  'chat.refused':    'refused',
  'chat.error':      'error',
  'git.commit':      'commit message',
  'vision.describe': 'describe image',
};

/** A refusal is not an error and a failure is not a refusal — they read apart. */
const STAGE_TONE: Record<string, string> = {
  'chat.complete': 'var(--color-success)',
  'chat.refused':  'var(--color-warning)',
  'chat.error':    'var(--color-error)',
};

// ─── Badges ───────────────────────────────────────────────────────────────────

function ModuleBadge({ label, color }: ModuleInfo) {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 whitespace-nowrap"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 18%, transparent)` }}
    >
      {label}
    </span>
  );
}

function StageBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 whitespace-nowrap"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}
    >
      {label}
    </span>
  );
}

// ─── Payload block with draggable editor ─────────────────────────────────────

const DEFAULT_PAYLOAD_HEIGHT = 120;
const MIN_PAYLOAD_HEIGHT = 80;
const MAX_PAYLOAD_HEIGHT = 600;

/** Pretty when it is JSON, verbatim when it is not. */
function pretty(value: string | undefined): string | undefined {
  if (!value) return value;
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function PayloadBlock({ label, value, color, lang = 'plaintext' }: {
  label: string; value: string | null | undefined; color: string; lang?: CodeLanguage;
}) {
  const [height, setHeight] = useState(DEFAULT_PAYLOAD_HEIGHT);
  const [wrap, setWrap] = useState(true);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const diff = e.clientY - startY.current;
      setHeight(Math.max(MIN_PAYLOAD_HEIGHT, Math.min(MAX_PAYLOAD_HEIGHT, startH.current + diff)));
    };
    const onMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    isDragging.current = true; startY.current = e.clientY; startH.current = height; e.preventDefault();
  };

  if (!value) return null;
  const trimmed = value.trim();
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const language: CodeLanguage = isJson ? 'json' : lang;
  let display = value;
  if (isJson) { try { display = JSON.stringify(JSON.parse(trimmed), null, 2); } catch { /* raw */ } }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
          style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
          {label}
        </span>
        <span className="text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {display.length.toLocaleString()} chars
        </span>
        <button
          type="button"
          onClick={() => setWrap(w => !w)}
          aria-pressed={wrap}
          className="ml-auto w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors"
          style={{
            color: wrap ? color : 'var(--color-text-muted)',
            background: wrap ? `color-mix(in srgb, ${color} 14%, transparent)` : 'transparent',
          }}
          title={wrap ? 'Wrapping long lines — click for one line each' : 'Long lines run off the edge — click to wrap'}
          aria-label={`Wrap ${label}`}
        >
          <I.WrapLines size={11} />
        </button>
      </div>
      <div className="rounded-lg overflow-hidden border relative" style={{ borderColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        {/* Whole, not the first 6,000 characters. The block scrolls and the
            handle below resizes it; a record you cannot read to the end of is
            not a record. */}
        <CodeEditor value={display} language={language} readOnly height={`${height}px`} wordWrap={wrap} />
        <div onMouseDown={handleDragStart}
          className="absolute bottom-0 left-0 right-0 h-[7px] flex items-center justify-center select-none z-10"
          style={{ cursor: 'ns-resize', backgroundColor: `color-mix(in srgb, ${color} 8%, var(--color-surface))`, borderTop: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}
          title="Drag to resize">
          <div className="flex gap-[3px]">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 50%, transparent)` }} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AuditLogTab() {
  const [aiEntries, setAiEntries] = useState<Omit<CakAuditEntry, 'kind'>[]>([]);
  const [uiEntries, setUiEntries] = useState<Omit<UiAuditEntry, 'kind'>[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    post('aiAudit:load', { limit: 500 });
    post('uiAudit:load', { limit: 500 });
  }, []);

  useEffect(() => {
    load();
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'aiAudit:data') setAiEntries(e.data.entries ?? []);
      if (e.data?.type === 'uiAudit:data') setUiEntries(e.data.entries ?? []);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [load]);

  /* Clearing the audit log is asked about first. The log exists precisely to
     answer questions after the fact, so it is the one thing here whose loss
     cannot be worked around by redoing something. */
  const [confirmClear, setConfirmClear] = useState(false);

  const reallyClear = () => {
    setConfirmClear(false);
    post('aiAudit:clear');
    post('uiAudit:clear');
    setAiEntries([]); setUiEntries([]); setExpanded(null);
  };

  const allEntries: AnyAuditEntry[] = [
    ...aiEntries.map(e => ({ ...e, kind: 'ai' as const })),
    ...uiEntries.map(e => ({ ...e, kind: 'ui' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filtered = allEntries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (e.kind === 'ai') {
      return e.stage.toLowerCase().includes(q)
        || (e.model ?? '').toLowerCase().includes(q)
        || (e.provider ?? '').toLowerCase().includes(q)
        || (e.user_prompt ?? '').toLowerCase().includes(q);
    }
    return e.event_type.toLowerCase().includes(q)
      || e.module.toLowerCase().includes(q)
      || (e.button ?? '').toLowerCase().includes(q);
  });

  // Use index for uniqueness — audit_id can be 0/undefined for UI events.
  const rowKey = (e: AnyAuditEntry, idx: number) => `${e.kind}-${e.audit_id}-${idx}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <ModalView
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear the audit log?"
        size="sm"
        footerRight={
          <div style={{ display: 'flex', gap: 8 }}>
            <ButtonView variant="secondary" size="sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </ButtonView>
            <ButtonView variant="primary" size="sm" accentColor="var(--color-error)" onClick={reallyClear}>
              Clear {allEntries.length ? `${allEntries.length} entries` : 'all'}
            </ButtonView>
          </div>
        }
      >
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          Every model call and panel action recorded so far is removed, and cannot be
          recovered. The log is what answers questions after the fact.
        </span>
      </ModalView>

      {/* ─── Toolbar ─── */}
      <div className="flex items-center border-b shrink-0"
        style={{ height: 28, borderColor: 'var(--color-surface-border)', backgroundColor: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)' }}>
        <div className="flex items-center gap-1.5 flex-1 h-full px-2.5 border-r" style={{ borderColor: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)' }}>
          <I.Search size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by module, stage, event…"
            aria-label="Filter the audit log"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[11px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} title="Clear filter" aria-label="Clear filter"
              className="w-4 h-4 flex items-center justify-center rounded cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              <I.Close size={9} />
            </button>
          ) : (
            <span className="text-[10px] font-mono tabular-nums px-1 rounded shrink-0 leading-none"
              style={{ color: 'var(--color-text-muted)', backgroundColor: 'color-mix(in srgb, var(--color-text-primary) 5%, transparent)' }}>
              {filtered.length}
            </span>
          )}
        </div>
        <div className="flex items-center px-1 shrink-0">
          <button type="button" onClick={load} title="Refresh" aria-label="Refresh"
            className="w-6 h-6 flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] transition-colors">
            <I.Refresh size={12} />
          </button>
          <button type="button" onClick={() => setConfirmClear(true)} title="Clear all" aria-label="Clear all"
            className="w-6 h-6 flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] transition-colors">
            <I.Trash size={12} />
          </button>
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-[var(--color-text-muted)]">
            {allEntries.length === 0 ? 'No audit entries yet — model calls and panel actions appear here' : 'No matches'}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
              <tr className="border-b border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]">
                <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)] w-[32px]">#</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[90px]">Module</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)]">Stage / Event</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[90px]">Model / Button</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)]">Preview</th>
                <th className="text-right px-2 py-2 font-medium text-[var(--color-text-muted)] w-[68px]">Duration</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[120px]">Time</th>
                <th className="w-[24px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, idx) => {
                const key = rowKey(e, idx);
                const isOpen = expanded === key;
                const rowNum = filtered.length - idx;
                const modInfo: ModuleInfo = e.kind === 'ai'
                  ? moduleFromStage(e.stage)
                  : (MODULE_MAP[e.module] ?? { label: e.module, color: 'var(--color-text-muted)' });
                const color = e.kind === 'ai' ? (STAGE_TONE[e.stage] ?? modInfo.color) : modInfo.color;

                const stageLabel = e.kind === 'ai'
                  ? (STAGE_LABEL[e.stage] ?? e.stage.split('.').pop() ?? e.stage)
                  : (e.button ? `${e.button}` : e.event_type.split('.').pop() ?? e.event_type);

                const modelOrButton = e.kind === 'ai' ? (e.model ?? '—') : (e.action ?? '—');
                const previewText = e.kind === 'ai'
                  ? (e.error ? `${e.error}` : (e.user_prompt ?? '').slice(0, 80) || _metaSummary(e.meta))
                  : (e.event_type);

                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="border-b border-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)] cursor-pointer transition-colors"
                      style={{ background: isOpen ? `color-mix(in srgb, ${color} 5%, transparent)` : undefined }}
                      onMouseEnter={ev => { if (!isOpen) (ev.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)'; }}
                      onMouseLeave={ev => { if (!isOpen) (ev.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      <td className="px-3 py-2 text-[var(--color-text-muted)] font-mono text-[10px]">{rowNum}</td>
                      <td className="px-2 py-2"><ModuleBadge label={modInfo.label} color={modInfo.color} /></td>
                      <td className="px-2 py-2"><StageBadge label={stageLabel} color={color} /></td>
                      <td className="px-2 py-2 text-[var(--color-text-muted)] truncate text-[10.5px]">{modelOrButton}</td>
                      <td className="px-2 py-2 text-[10.5px] truncate max-w-[180px]">
                        {e.kind === 'ai' && e.error
                          ? <span className="text-[#ef4444]">{previewText}</span>
                          : <span className="text-[var(--color-text-primary)]">{previewText}</span>}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-[10px]" style={{ color: e.kind === 'ai' && e.duration_ms != null ? color : 'var(--color-text-muted)' }}>
                        {e.kind === 'ai' && e.duration_ms != null ? `${e.duration_ms}ms` : '—'}
                      </td>
                      <td className="px-2 py-2 text-[var(--color-text-muted)] font-mono text-[10px]">
                        {(e.created_at ?? '').replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="px-2 py-2">
                        <I.Chevron size={11} style={{ color, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="px-4 pb-4 pt-2" style={{ background: `color-mix(in srgb, ${color} 4%, var(--color-surface))` }}>
                          {e.kind === 'ai' ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-4 flex-wrap text-[10.5px]">
                                <Kv label="Conversation" value={e.conversation_id} color={color} />
                                {e.provider && <Kv label="Provider" value={e.provider} color={color} />}
                                {e.input_tokens != null && <Kv label="Tokens" value={`${e.input_tokens} in · ${e.output_tokens ?? 0} out`} color={color} />}
                                {e.cost_usd ? <Kv label="Cost" value={`$${e.cost_usd.toFixed(4)}`} color={color} /> : null}
                              </div>
                              {e.system_prompt && <PayloadBlock label="System Prompt" value={e.system_prompt} color="#818cf8" />}
                              {e.user_prompt && <PayloadBlock label="User Prompt" value={e.user_prompt} color="#06b6d4" />}
                              {e.request_payload && <PayloadBlock label="Request" value={pretty(e.request_payload)} color="#f59e0b" lang="json" />}
                              {e.response_payload && <PayloadBlock label="Response" value={pretty(e.response_payload)} color="#10b981" lang="json" />}
                              {e.headers && <PayloadBlock label="Headers" value={pretty(e.headers)} color="#94a3b8" lang="json" />}
                              {e.meta && <PayloadBlock label="Metadata" value={pretty(e.meta)} color={color} lang="json" />}
                              {!e.system_prompt && !e.user_prompt && !e.request_payload && (
                                <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-muted)]">
                                  <I.Info size={11} />
                                  Bodies were not recorded for this call — the payload here is your source code, so it stays off unless you ask for it.
                                </div>
                              )}
                              {e.error && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded self-start text-[#ef4444] bg-[rgba(239,68,68,0.1)]">Error</span>
                                  <p className="text-[10.5px] font-mono text-[#ef4444] px-1">{e.error}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-4 flex-wrap text-[10.5px]">
                                <Kv label="Event" value={e.event_type} color={color} />
                                {e.button && <Kv label="Button" value={e.button} color={color} />}
                                {e.action && <Kv label="Action" value={e.action} color={color} />}
                              </div>
                              {e.metadata && <PayloadBlock label="Metadata" value={pretty(e.metadata)} color={color} lang="json" />}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kv({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--color-text-muted)] shrink-0">{label}</span>
      <span className="font-mono px-2 py-0.5 rounded text-[10px]"
        style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
        {value}
      </span>
    </div>
  );
}

function _metaSummary(meta?: string): string {
  try {
    const m = JSON.parse(meta ?? '{}') as { messages?: number; tools?: number };
    return `${m.messages ?? 0} messages · ${m.tools ?? 0} tools`;
  } catch {
    return '—';
  }
}
