/* Git Tools — the settings behind the sidebar.
 *
 * The prompt, the diff mode and the price on one screen: past the threshold the
 * diff is compressed to --stat, which loses line content, and that is worth
 * seeing before a commit message comes back vague. */

import * as I from '../../icons';
import { Card, Chip, PageHead, SectionTitle, Slider, Stepper } from '../../ui';
import { actions, type AppState } from '../state';

export function GitTools({ state }: { state: AppState }) {
  const threshold = state.maxDiffFiles ?? 500;
  const prompt = state.gitPrompt ?? '';

  return (
    <div className="set-main">
      <PageHead
        title="Git Tools"
        sub="commit messages from your working diff"
        right={<Chip tone="mute" mono>sidebar: Git AI</Chip>}
      />

      <SectionTitle right="placeholders fill from the repo">Prompt</SectionTitle>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {['{branch}', '{repo}', '{diff}', '{guidance}'].map(p => (
          <Chip key={p} tone="pri" mono>{p}</Chip>
        ))}
      </div>
      <div className="inp" style={{ height: 'auto', padding: 10, alignItems: 'stretch' }}>
        <textarea
          value={prompt}
          onChange={e => actions.saveConfig('gitPrompt', e.target.value)}
          placeholder="Empty — the built-in conventional-commit prompt is used."
          aria-label="Git commit prompt"
          rows={9}
          className="mono"
          style={{ fontSize: 11.5, lineHeight: 1.7, resize: 'vertical' }}
        />
      </div>

      <SectionTitle>Diff</SectionTitle>
      <Card>
        <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5 }}>Compress past</span>
            <Slider pct={Math.min(100, (threshold / 1000) * 100)} label="Diff threshold" />
            <Stepper
              label="Diff threshold"
              value={`${threshold} files`}
              onDec={() => actions.saveConfig('maxDiffFiles', Math.max(10, threshold - 50))}
              onInc={() => actions.saveConfig('maxDiffFiles', threshold + 50)}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-muted)', lineHeight: 1.6 }}>
            Past this many changed files the diff is sent as <span className="mono">--stat</span> and{' '}
            <span className="mono">--numstat</span>. That keeps the request inside the context window, but
            the model no longer sees line content — expect a summary rather than specifics.
          </div>
        </div>
      </Card>

      <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', gap: 7, alignItems: 'center' }}>
        <I.Info size={12} />
        Generation runs through the spend guard like any other request, so a commit message counts
        against the daily budget.
      </div>
    </div>
  );
}
