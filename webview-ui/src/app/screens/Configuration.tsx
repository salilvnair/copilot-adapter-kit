/* Configuration — every setting with the sentence that says what it costs.
 *
 * Three tabs, because the three groups are read at different times: general
 * settings when something is misbehaving, prompts when tuning output, vision
 * when images are involved and the bill looks wrong. */

import { useState } from 'react';
import * as I from '../../icons';
import { Card, Chip, IconBtn, PageHead, SectionTitle, Segmented, SettingRow, Slider, Stepper, Switch } from '../../ui';
import { actions, type AppState , parseTokens} from '../state';

type Tab = 'general' | 'prompts' | 'vision';

export function Configuration({ state }: { state: AppState }) {
  const [tab, setTab] = useState<Tab>('general');
  const changed = _changedCount(state);

  return (
    <div className="set-main">
      <PageHead
        title="Configuration"
        sub="applies to every provider"
        right={
          <>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'general', label: 'General' },
                { value: 'prompts', label: 'Prompts' },
                { value: 'vision', label: 'Vision' },
              ]}
            />
            {changed > 0 && <Chip tone="pri" mono>{changed} changed</Chip>}
            <IconBtn icon={<I.Braces />} label="Open settings.json" onClick={actions.openSettings} />
          </>
        }
      />

      {tab === 'general' && <General state={state} />}
      {tab === 'prompts' && <Prompts state={state} />}
      {tab === 'vision' && <Vision state={state} />}
    </div>
  );
}

/* ── General ──────────────────────────────────────────────────────────── */

function General({ state }: { state: AppState }) {
  const set = (key: string, value: unknown) => actions.saveConfig(key, value);
  const guardCap = state.budget?.caps.maxOutputTokens || 0;

  const probeMins = state.probeIntervalMinutes ?? 5;

  return (
    <>
      <SectionTitle>Connections</SectionTitle>
      <div>
        <SettingRow
          name="Reachability check interval"
          modified={probeMins !== 5}
          desc={probeMins > 0
            ? <>A provider&rsquo;s status is reused for this long before the endpoint is asked
                again. The probe is a <span className="mono">GET /models</span> with no key
                attached, so it costs nothing &mdash; but it is still a request to someone
                else&rsquo;s service. <b>Test</b> always asks, whatever this says.</>
            : <>Every provider is probed each time the panel opens.</>}
        >
          <Stepper
            label="Reachability check interval"
            value={probeMins > 0 ? `${probeMins} min` : 'every open'}
            num={probeMins}
            onSet={n => set('health.probeIntervalMinutes', Math.max(0, n))}
            format={n => (n > 0 ? `${n} min` : 'every open')}
            parse={t => parseInt(t, 10)}
            onDec={() => set('health.probeIntervalMinutes', Math.max(0, probeMins - 5))}
            onInc={() => set('health.probeIntervalMinutes', probeMins + 5)}
          />
        </SettingRow>
      </div>

      <SectionTitle>Requests</SectionTitle>
      <div>
        <SettingRow
          name="Max output tokens"
          modified={state.maxTokens !== 0}
          desc={<>Sent as <span className="mono">max_tokens</span>. The Spend Guard applies its own ceiling on top, so output is never unbounded.</>}
        >
          <Chip tone="ok">guard caps at {guardCap > 0 ? _k(guardCap) : 'model max'}</Chip>
          <Stepper
            label="Max output tokens"
            value={state.maxTokens > 0 ? _k(state.maxTokens) : 'model'}
            num={state.maxTokens}
            onSet={n => set('maxTokens', n)}
            format={n => (n > 0 ? _k(n) : 'model')}
            parse={parseTokens}
            onDec={() => set('maxTokens', Math.max(0, state.maxTokens - 4096))}
            onInc={() => set('maxTokens', state.maxTokens + 4096)}
          />
        </SettingRow>

        <SettingRow
          name={<>Tool stabilization <Chip tone="warn" style={{ height: 16, fontSize: 9.5 }}>experimental</Chip></>}
          desc="Pre-activates every tool so the tools array stops changing between turns, which keeps the provider's prompt cache warm. Costs up to three extra round trips on the first turn."
        >
          <Switch
            label="Tool stabilization"
            on={state.stabilizeTools ?? false}
            onChange={v => set('stabilizeTools', v)}
          />
        </SettingRow>

        <SettingRow
          name="Log level"
          modified={state.logLevel !== 'quiet'}
          desc={<><b>Dump</b> writes every request body to disk, system prompt and tool schemas included.</>}
        >
          <Segmented
            value={state.logLevel as 'quiet' | 'meta' | 'dump'}
            onChange={v => set('logLevel', v)}
            options={[
              { value: 'quiet', label: 'Quiet' },
              { value: 'meta', label: 'Meta' },
              { value: 'dump', label: 'Dump' },
            ]}
          />
        </SettingRow>
      </div>

      <SectionTitle>Git</SectionTitle>
      <div>
        <SettingRow
          name="Diff size threshold"
          modified={(state.maxDiffFiles ?? 500) !== 500}
          desc={<>Above this many changed files, Git Tools sends <span className="mono">--stat</span> and <span className="mono">--numstat</span> instead of the full diff.</>}
        >
          <Slider pct={Math.min(100, ((state.maxDiffFiles ?? 500) / 1000) * 100)} label="Diff threshold" />
          <Stepper
            label="Diff threshold"
            value={`${state.maxDiffFiles ?? 500} files`}
            num={state.maxDiffFiles ?? 500}
            onSet={n => set('maxDiffFiles', Math.max(1, n))}
            format={n => `${n} files`}
            parse={t => parseInt(t, 10)}
            onDec={() => set('maxDiffFiles', Math.max(10, (state.maxDiffFiles ?? 500) - 50))}
            onInc={() => set('maxDiffFiles', (state.maxDiffFiles ?? 500) + 50)}
          />
        </SettingRow>
      </div>
    </>
  );
}

/* ── Prompts ──────────────────────────────────────────────────────────── */

function Prompts({ state }: { state: AppState }) {
  const [which, setWhich] = useState<'system' | 'user' | 'git'>('system');
  const value = which === 'system' ? state.systemPrompt ?? ''
    : which === 'user' ? state.userPromptTemplate ?? ''
      : state.gitPrompt ?? '';
  const key = which === 'system' ? 'systemPrompt' : which === 'user' ? 'userPromptTemplate' : 'gitPrompt';
  const tokens = Math.ceil(value.length / 3.6);
  const perDay = (state.budget?.day.requests ?? 0) * tokens;

  const placeholders = which === 'git'
    ? ['{branch}', '{repo}', '{diff}', '{guidance}']
    : which === 'user' ? ['{userMessage}'] : ['{model}', '{date}', '{tools}', '{cakVersion}'];

  return (
    <>
      <div className="sec-t">
        Template
        <span className="r">
          <Segmented
            value={which}
            onChange={setWhich}
            options={[
              { value: 'system', label: 'System' },
              { value: 'user', label: 'User wrapper' },
              { value: 'git', label: 'Git' },
            ]}
          />
        </span>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {placeholders.map(p => <Chip key={p} tone="pri" mono>{p}</Chip>)}
      </div>

      <div className="inp" style={{ height: 'auto', padding: 10, alignItems: 'stretch' }}>
        <textarea
          value={value}
          onChange={e => actions.saveConfig(key, e.target.value)}
          placeholder={which === 'system'
            ? 'Empty — Copilot’s own system prompt is used unchanged.'
            : which === 'user' ? 'Wrap each user message, e.g. {userMessage}'
              : 'Empty — the built-in commit prompt is used.'}
          aria-label={`${which} prompt`}
          rows={10}
          className="mono"
          style={{ fontSize: 11.5, lineHeight: 1.7, resize: 'vertical' }}
        />
      </div>

      {value.trim() !== '' && (
        <Card header="Cost of this template" right="at today's volume">
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', paddingTop: 10 }}>
            <div><div className="tile-k">Per request</div><div className="mono" style={{ fontSize: 15 }}>{tokens} tok</div></div>
            <div><div className="tile-k">{state.budget?.day.requests ?? 0} requests today</div>
              <div className="mono" style={{ fontSize: 15 }}>{_k(perDay)} tok</div></div>
          </div>
        </Card>
      )}

      {which === 'system' && value.trim() !== '' && (
        <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--c-warning)', display: 'flex', marginTop: 2 }}><I.Warning size={12} /></span>
          A system prompt is injected as a <b>user</b> message ahead of Copilot&rsquo;s own. It is re-sent
          every turn and it shifts the cache prefix.
        </div>
      )}
    </>
  );
}

/* ── Vision ───────────────────────────────────────────────────────────── */

function Vision({ state }: { state: AppState }) {
  const model = state.visionFallbackModel ?? '';

  return (
    <>
      <Card header="Route" right="as configured now">
        <div className="flow" style={{ paddingTop: 12, overflowX: 'auto' }}>
          <span className="fnode"><b>Image in chat</b><span className="s">any attachment</span></span>
          <span className="arr"><I.ArrowRight size={16} /></span>
          <span className="fnode q"><b>Model has vision?</b><span className="s">meta.image</span></span>
          <span className="arr"><I.ArrowRight size={16} /></span>
          <span className="fnode" style={{ borderColor: model ? 'var(--c-warning)' : undefined }}>
            <b>{model || 'no fallback set'}</b>
            <span className="s">{model ? '1 call per image, per turn' : 'images are dropped'}</span>
          </span>
          <span className="arr"><I.ArrowRight size={16} /></span>
          <span className="fnode" style={{ borderColor: 'var(--c-success)' }}>
            <b>your chosen model</b><span className="s">receives text</span>
          </span>
        </div>
      </Card>

      <div>
        <SettingRow
          name="Fallback model"
          desc={<>Anything with vision, including Copilot&rsquo;s own — <span className="mono">copilot:gpt-5.2</span></>}
        >
          <div className="inp mono" style={{ width: 220, height: 28 }}>
            <input
              value={model}
              onChange={e => actions.saveConfig('visionFallbackModel', e.target.value)}
              placeholder="family:model-id"
              aria-label="Vision fallback model"
              style={{ fontSize: 11.5 }}
            />
          </div>
        </SettingRow>

        <SettingRow
          name="Always preprocess"
          modified={state.visionFallbackAlways === true}
          desc="Route images through the fallback even when the model could see them itself. Costs one extra call per image on every turn, because nothing is cached between turns."
        >
          <Switch
            label="Always preprocess images"
            on={state.visionFallbackAlways ?? false}
            onChange={v => actions.saveConfig('visionFallbackAlways', v)}
          />
        </SettingRow>
      </div>
    </>
  );
}

function _changedCount(s: AppState): number {
  let n = 0;
  if (s.maxTokens !== 0) n++;
  if (s.logLevel !== 'quiet') n++;
  if (s.stabilizeTools) n++;
  if ((s.maxDiffFiles ?? 500) !== 500) n++;
  if ((s.systemPrompt ?? '') !== '') n++;
  if ((s.userPromptTemplate ?? '') !== '') n++;
  if ((s.gitPrompt ?? '') !== '') n++;
  if ((s.visionFallbackModel ?? '') !== '') n++;
  if (s.visionFallbackAlways) n++;
  return n;
}

function _k(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}
