/* Git AI — the sidebar, at the 340px it actually gets.
 *
 * The old panel put two unlabelled dropdowns on one line, clipped the second,
 * and left five hundred pixels of grey under a single sentence. Everything
 * filling that space here is data the panel already computed and discarded:
 * the branch, the staged counts, the per-file diff stats. */

import { useEffect, useState } from 'react';
import * as I from '../../icons';
import { AiBtn, Btn, Chip, CloseBtn, EmptyState, IconBtn, Segmented } from '../../ui';
import { Menu } from '../../ui/Menu';
import { onMessage, post, vscode as vscodeApi } from '../../vscode';

export interface GitFile {
  path: string;
  dir: string;
  added: number;
  removed: number;
  staged: boolean;
  /** Untracked, modified, deleted — decides the icon's colour. */
  state: 'new' | 'modified' | 'deleted';
}

export interface GitState {
  /** True when this came from the dev fixture, not the extension. */
  isSample?: boolean;
  repo?: string;
  branch?: string;
  ahead: number;
  behind: number;
  files: GitFile[];
  staged: number;
  changed: number;
  hasRepo: boolean;
  providers: { uuid: string; name: string; family: string; hasKey: boolean }[];
  models: { id: string; name: string; family: string }[];
  chosenModel?: string;
  /** Token/cost estimate for the prompt as it currently stands. */
  estimate?: { tokens: number; costUsd: number };
  guard?: { pct: number; used: number; limit: number; costUsd: number; enforce: boolean };
}

type Gen =
  | { phase: 'idle' }
  | { phase: 'running'; text: string; startedAt: number }
  | { phase: 'done'; text: string; ms: number; tokPerSec: number }
  | { phase: 'error'; message: string };

export function GitAI() {
  const [s, setS] = useState<GitState | undefined>(undefined);
  const [msg, setMsg] = useState('');
  const [scope, setScope] = useState<'staged' | 'all'>('staged');
  const [gen, setGen] = useState<Gen>({ phase: 'idle' });

  useEffect(() => {
    const off = onMessage(m => {
      if (m.type === 'gitState') setS(m.payload as GitState);
      if (m.type === 'genStart') setGen({ phase: 'running', text: '', startedAt: Date.now() });
      if (m.type === 'genToken') {
        setGen(g => (g.phase === 'running' ? { ...g, text: g.text + String(m.payload) } : g));
      }
      if (m.type === 'genDone') {
        const p = m.payload as { text: string; ms: number; tokPerSec: number };
        setGen({ phase: 'done', text: p.text, ms: p.ms, tokPerSec: p.tokPerSec });
      }
      if (m.type === 'genError') setGen({ phase: 'error', message: String((m.payload as any)?.message ?? m.payload) });
    });
    post('getState');

    // Outside VS Code there is no host to answer. Clearly marked as sample.
    if (import.meta.env.DEV && !vscodeApi()) {
      setS({
        isSample: true,
        hasRepo: true, repo: 'copilot-adapter-kit', branch: 'main', ahead: 2, behind: 0,
        staged: 3, changed: 5,
        files: [
          { path: 'budget.ts', dir: 'src/kernel', added: 287, removed: 0, staged: true, state: 'new' },
          { path: 'budget-warden.ts', dir: 'src/crosscut', added: 158, removed: 0, staged: true, state: 'new' },
          { path: 'entry.ts', dir: 'src', added: 184, removed: 7, staged: true, state: 'modified' },
          { path: 'token-math.ts', dir: 'src/tooling', added: 72, removed: 23, staged: false, state: 'modified' },
          { path: 'README.md', dir: '', added: 58, removed: 0, staged: false, state: 'modified' },
        ],
        providers: [], models: [{ id: 'deepseek-chat', name: 'deepseek-chat', family: 'deepseek' }],
        chosenModel: 'deepseek-chat',
        estimate: { tokens: 4200, costUsd: 0.01 },
        guard: { pct: 92, used: 1_840_000, limit: 2_000_000, costUsd: 18.42, enforce: true },
      });
    }

    return off;
  }, []);

  if (!s) return <div className="sidebar" />;

  if (!s.hasRepo) {
    return (
      <div className="sidebar">
        <Title repo={undefined} />
        <EmptyState
          icon={<I.Branch size={20} />}
          title="No repository here"
          detail="Git AI writes commit messages from your working diff. Open a folder that is under version control to get started."
        >
          <span style={{ display: 'flex', gap: 7, marginTop: 4 }}>
            <Btn variant="pri" icon={<I.Folder size={12} />} onClick={() => post('openFolder')}>
              Open folder
            </Btn>
            <Btn onClick={() => post('initRepo')}>Init repo</Btn>
          </span>
        </EmptyState>
        <Foot guard={s.guard} />
      </div>
    );
  }

  const files = scope === 'staged' && s.files.some(f => f.staged)
    ? s.files.filter(f => f.staged)
    : s.files;
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const model = s.models.find(m => m.id === s.chosenModel) ?? s.models[0];

  return (
    <div className="sidebar">
      {s.isSample && <div className="fixture-bar">Sample data — not your repository</div>}
      <Title repo={s.repo} />

      <div className="repo-strip">
        <Chip tone="pri">
          <I.Branch size={11} width={2.2} />
          {s.branch ?? 'detached'}
        </Chip>
        {s.ahead > 0 && <Chip tone="mute" mono>&uarr;{s.ahead}</Chip>}
        {s.behind > 0 && <Chip tone="mute" mono>&darr;{s.behind}</Chip>}
        {s.staged > 0 && <Chip tone="ok" mono>+{s.staged} staged</Chip>}
        {s.changed > 0 && <Chip tone="warn" mono>{s.changed} changed</Chip>}
        <span style={{ marginLeft: 'auto' }}>
          <IconBtn icon={<I.Refresh size={12} />} label="Refresh" ghost
            className="sm" onClick={() => post('refreshGit')} />
        </span>
      </div>

      <div className="composer">
        <label className={`ta${msg ? ' focused' : ''}`}>
          <textarea
            value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder="Describe your changes (optional)…"
            aria-label="Guidance for the commit message"
            rows={2}
          />
        </label>

        <div className="composer-row">
          <button type="button" className="model-pill" onClick={() => post('pickModel')}>
            <span className="dot" style={{ background: model ? 'var(--c-success)' : 'var(--c-muted)' }} />
            {model?.name ?? 'No model'}
            <I.Chevron size={10} />
          </button>
          {s.estimate && (
            <span className="cost-hint mono">
              ~{_k(s.estimate.tokens)}
              {s.estimate.costUsd > 0 && ` · $${s.estimate.costUsd.toFixed(2)}`}
            </span>
          )}
        </div>

        <div className="composer-row">
          <AiBtn
            icon={<I.Sparkle size={13} />}
            onClick={() => { setGen({ phase: 'running', text: '', startedAt: Date.now() }); post('generate', { message: msg, scope }); }}
          >
            {gen.phase === 'running' ? 'Generating…' : 'Generate'}
          </AiBtn>
          <IconBtn icon={<I.Sliders size={13} />} label="Prompt settings" onClick={() => post('openGitSettings')} />
          <Segmented
            className="ml-auto"
            value={scope}
            onChange={setScope}
            options={[{ value: 'staged', label: 'Staged' }, { value: 'all', label: 'All' }]}
          />
        </div>
      </div>

      <div style={{ padding: '8px 0 2px' }}>
        <div style={{
          padding: '0 12px 6px', fontSize: 10.5, letterSpacing: '.07em',
          textTransform: 'uppercase', color: 'var(--c-muted)', display: 'flex',
        }}>
          Changed files
          <span style={{ marginLeft: 'auto' }} className="mono">
            {added > 0 && `+${added}`}{removed > 0 && ` −${removed}`}
          </span>
        </div>

        {files.length === 0 ? (
          <div style={{ padding: '4px 12px 8px', fontSize: 11.5, color: 'var(--c-muted)' }}>
            Nothing {scope === 'staged' ? 'staged' : 'changed'}.
          </div>
        ) : files.slice(0, 40).map(f => (
          <button key={f.path + f.dir} type="button" className="file-row"
            onClick={() => post('openFile', { path: f.dir ? `${f.dir}/${f.path}` : f.path })}>
            <I.File size={13} className={`f-${f.state}`} />
            <span className="name">
              {f.path} {f.dir && <span className="path">{f.dir}</span>}
            </span>
            <span className="fstat">
              {f.added > 0 && <span className="stat-add mono">+{f.added}</span>}
              {f.removed > 0 && <span className="stat-del mono">&minus;{f.removed}</span>}
            </span>
          </button>
        ))}
      </div>

      {gen.phase !== 'idle' && <Message gen={gen} onClear={() => setGen({ phase: 'idle' })} />}

      <Foot guard={s.guard} />
    </div>
  );
}

/* ── Parts ────────────────────────────────────────────────────────────── */

function Title({ repo }: { repo?: string }) {
  return (
    <div className="side-title">
      Git AI
      {repo && (
        <Chip tone="mute" style={{ height: 17, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>
          {repo}
        </Chip>
      )}
      <span className="r">
        <IconBtn icon={<I.Refresh size={14} />} label="Refresh" ghost onClick={() => post('refreshGit')} />
        <Menu
          label="Git AI options"
          align="right"
          items={[
            { id: 'settings', label: 'Prompt settings', icon: <I.Sliders size={13} />, onClick: () => post('openGitSettings') },
            { id: 'panel', label: 'Open Copilot Adapter Kit', icon: <I.Gear size={13} />, onClick: () => post('openPanel') },
          ]}
        />
      </span>
    </div>
  );
}

function Message({ gen, onClear }: { gen: Gen; onClear: () => void }) {
  if (gen.phase === 'error') {
    return (
      <div className="msg-card" style={{ borderColor: 'rgba(239,68,68,.4)' }}>
        <div className="msg-head">
          <Chip tone="err" dot style={{ height: 18, fontSize: 10 }}>failed</Chip>
          <span className="r"><CloseBtn onClick={onClear} label="Dismiss" /></span>
        </div>
        <div className="msg-body">
          <span style={{ color: 'var(--c-error)' }}>{gen.message}</span>
        </div>
      </div>
    );
  }

  const running = gen.phase === 'running';
  const text = gen.phase === 'running' || gen.phase === 'done' ? gen.text : '';
  const [subject, ...rest] = text.split('\n');

  return (
    <div className="msg-card">
      <div className="msg-head">
        {running
          ? <Chip tone="pri" dot style={{ height: 18, fontSize: 10 }}>streaming</Chip>
          : <Chip tone="ok" dot style={{ height: 18, fontSize: 10 }}>ready</Chip>}
        {gen.phase === 'done' && (
          <span className="mono" style={{ color: 'var(--c-muted)', fontSize: 10.5 }}>
            {(gen.ms / 1000).toFixed(1)}s · {gen.tokPerSec} tok/s
          </span>
        )}
        <span className="r">
          <CloseBtn onClick={onClear} label="Discard message" />
        </span>
      </div>

      <div className="msg-body">
        <span className="h1">{subject || ' '}{running && <span className="caret" />}</span>
        {rest.join('\n').trim() && (
          <span style={{ color: 'var(--c-text-2)', whiteSpace: 'pre-wrap' }}>
            {rest.join('\n').trim()}
          </span>
        )}
      </div>

      {!running && text.trim() && (
        <div className="msg-actions">
          <Btn variant="pri" icon={<I.Commit size={12} />} onClick={() => post('commit', { message: text })}>
            Commit
          </Btn>
          <IconBtn icon={<I.ArrowUp />} label="Commit and push" onClick={() => post('commit', { message: text, push: true })} />
          <IconBtn icon={<I.Copy />} label="Copy markdown" onClick={() => post('copy', { text })} />
          <IconBtn icon={<I.Refresh />} label="Regenerate" onClick={() => post('generate', { regenerate: true })} />
        </div>
      )}
    </div>
  );
}

function Foot({ guard }: { guard?: GitState['guard'] }) {
  if (!guard) return <div className="sb-foot"><span className="mono">Guard idle</span></div>;
  const tone = !guard.enforce ? 'err' : guard.pct >= 100 ? 'err' : guard.pct >= 80 ? 'warn' : 'ok';
  return (
    <div className="sb-foot">
      <Chip tone={tone} dot style={{ height: 18, fontSize: 10 }}>
        {guard.enforce ? `Guard ${Math.round(guard.pct)}%` : 'UNCAPPED'}
      </Chip>
      {guard.limit > 0 && (
        <span className="mono">{_k(guard.used)} / {_k(guard.limit)}</span>
      )}
      <span style={{ marginLeft: 'auto' }} className="mono">${guard.costUsd.toFixed(2)}</span>
    </div>
  );
}

function _k(n: number): string {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
