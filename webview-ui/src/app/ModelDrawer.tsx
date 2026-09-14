/* Model editor — every field on one surface, with a live picker preview.
 *
 * This replaces an eight-step sequence of quick-picks that could not be walked
 * backwards: getting the context window wrong at step four meant starting over. */

import { useEffect, useState } from 'react';
import * as I from '../icons';
import { Btn, Chip, CloseBtn, Field, SectionTitle, Segmented, SettingRow, Stepper } from '../ui';
import { actions, mark, type AppState, type ModelCfg } from './state';

/*
  The sizes providers actually publish, rather than a ladder of powers of two.

  Context: 128K is the long-standing OpenAI-compatible default, 200K is Claude
  Haiku 4.5, 256K and 400K are common on open-weight and hosted models, 1M is
  the Claude 5 family, Gemini and DeepSeek's current models, 2M is Gemini's
  long-context tier.

  Output: 64K is Gemini Flash, Claude Haiku 4.5 and DeepSeek's thinking default;
  128K is Claude Opus/Sonnet 5 and the current GPT-5/6 line; 300K is Anthropic's
  batch beta; 393216 is DeepSeek's max_tokens ceiling — 384K, and the number
  that prompted this list, because the ladder used to stop at 128K.

  No ladder covers every model, so Custom sits at the end of both.
*/
const CONTEXT = [4096, 8192, 16384, 32768, 65536, 128000, 200000, 256000, 400000, 1000000, 2000000];
const OUTPUT = [4096, 8192, 16384, 32768, 65536, 100000, 128000, 200000, 300000, 393216];

export function ModelDrawer({
  state, parentUuid, model, close,
}: {
  state: AppState;
  parentUuid: string;
  model?: ModelCfg;
  close: () => void;
}) {
  const provider = state.providers[parentUuid];
  const [id, setId] = useState(model?.id ?? '');
  const [name, setName] = useState(model?.name ?? '');
  const [detail, setDetail] = useState(model?.detail ?? '');
  const [maxIn, setMaxIn] = useState(model?.maxIn ?? 128000);
  const [maxOut, setMaxOut] = useState(model?.maxOut ?? 16384);
  const [image, setImage] = useState(model?.image ?? false);
  const [thinking, setThinking] = useState(model?.thinking ?? false);
  const [tools, setTools] = useState(model?.toolCalling ?? 128);
  const [apiPath, setApiPath] = useState(model?.apiPath ?? '');
  const [priceIn, setPriceIn] = useState(_price(model?.pricing, 0));
  const [priceOut, setPriceOut] = useState(_price(model?.pricing, 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const pricing = priceIn && priceOut ? `in $${priceIn} / out $${priceOut}` : undefined;
  const dirty = !model || id !== model.id || name !== (model.name ?? '') || maxIn !== model.maxIn
    || maxOut !== model.maxOut || image !== model.image || thinking !== model.thinking
    || tools !== model.toolCalling || pricing !== model.pricing;

  const save = () => {
    if (!id.trim()) return;
    actions.saveModel({
      ...model,
      parentUuid,
      id: id.trim(),
      name: name.trim() || id.trim(),
      family: provider?.family ?? model?.family ?? '',
      detail: detail.trim() || 'User-defined model',
      maxIn, maxOut, image, thinking,
      toolCalling: tools,
      apiPath: apiPath.trim() || undefined,
      pricing,
    });
    close();
  };

  return (
    <aside className="drawer in-split" role="dialog" aria-label={model ? 'Edit model' : 'Add model'}>
      <div className="drawer-h">
        {model ? <I.Pencil size={14} /> : <I.Plus size={14} width={2.2} />}
        {model ? model.name || model.id : 'Add model'}
        {dirty && <Chip tone="warn" mono style={{ height: 17, fontSize: 9.5 }}>unsaved</Chip>}
        <span style={{ marginLeft: 'auto' }}>
          <CloseBtn onClick={close} />
        </span>
      </div>

      <div className="drawer-b" style={{ overflowY: 'auto' }}>
        <Field label="Model ID">
          <div className="inp mono focus">
            <input value={id} onChange={e => setId(e.target.value)}
              placeholder="deepseek-chat" aria-label="Model ID" />
          </div>
        </Field>
        <Field label="Display name">
          <div className="inp">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder={id || 'Shown in the picker'} aria-label="Display name" />
          </div>
        </Field>
        <Field label="Description">
          <div className="inp">
            <input value={detail} onChange={e => setDetail(e.target.value)}
              placeholder="Balanced reasoning, 200K context" aria-label="Description" />
          </div>
        </Field>

        <SectionTitle right={<span className="mono">{_k(maxIn)} → {_k(maxOut)}</span>}>Window</SectionTitle>
        <TokenField label="Context" value={maxIn} onChange={setMaxIn} presets={CONTEXT} />
        <TokenField label="Max output" value={maxOut} onChange={setMaxOut} presets={OUTPUT} />

        <SectionTitle>Capabilities</SectionTitle>
        <div>
          <SettingRow name="Vision" desc="Images pass straight through instead of going to a fallback model">
            <button type="button" role="switch" aria-checked={image} aria-label="Vision"
              className={`sw${image ? ' on' : ''}`} onClick={() => setImage(v => !v)} />
          </SettingRow>
          <SettingRow
            name={<>Thinking <Chip tone="pri" style={{ height: 16, fontSize: 9.5 }}>adds a picker control</Chip></>}
            desc="Reasoning is streamed, stashed and replayed on the next turn"
          >
            <button type="button" role="switch" aria-checked={thinking} aria-label="Thinking"
              className={`sw${thinking ? ' on' : ''}`} onClick={() => setThinking(v => !v)} />
          </SettingRow>
          <SettingRow name="Parallel tool calls" desc="Copilot refuses to enable more tools than this">
            <Stepper
              label="Parallel tool calls"
              value={tools}
              num={tools}
              onSet={n => setTools(Math.min(512, Math.max(0, n)))}
              onDec={() => setTools(v => Math.max(0, v - 16))}
              onInc={() => setTools(v => Math.min(512, v + 16))}
            />
          </SettingRow>
        </div>

        <SectionTitle>Routing &amp; price</SectionTitle>
        <Field label="API path">
          <div className="inp mono ph">
            <input value={apiPath} onChange={e => setApiPath(e.target.value)}
              placeholder={`inherit — ${provider?.defaultApiPath ?? '/chat/completions'}`}
              aria-label="API path override" />
          </div>
        </Field>
        <div className="pane-2" style={{ gap: 10 }}>
          <Field label="Input / 1M">
            <div className="inp mono">
              <input value={priceIn} onChange={e => setPriceIn(e.target.value)}
                placeholder="3.00" aria-label="Input price per million tokens" />
            </div>
          </Field>
          <Field label="Output / 1M">
            <div className="inp mono">
              <input value={priceOut} onChange={e => setPriceOut(e.target.value)}
                placeholder="15.00" aria-label="Output price per million tokens" />
            </div>
          </Field>
        </div>

        <SectionTitle>Live preview</SectionTitle>
        <div className="picker" style={{ maxWidth: 'none' }}>
          <div className="prow on">
            <span className="prov-mark" style={{ width: 22, height: 22, fontSize: 9, borderRadius: 6 }}>
              {provider ? mark(provider) : '??'}
            </span>
            <span className="nm">
              <span>{name || id || 'Untitled model'}</span>
              <span className="b">{detail || 'User-defined model'}</span>
            </span>
            <Chip tone="mute" mono>{_k(maxIn)}</Chip>
          </div>
          <div style={{
            padding: '9px 12px', borderTop: '1px solid var(--c-surface-border)',
            display: 'flex', gap: 5, flexWrap: 'wrap',
          }}>
            {image && <Chip tone="info">vision</Chip>}
            {thinking && <Chip tone="pri">thinking</Chip>}
            {tools > 0 && <Chip tone="mute">tools {tools}</Chip>}
            {pricing && <Chip tone="mute" mono>{pricing}</Chip>}
            {!image && !thinking && !tools && !pricing && (
              <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>No capabilities declared</span>
            )}
          </div>
        </div>
      </div>

      <div className="drawer-f">
        {model && (
          <Btn variant="danger" icon={<I.Trash size={12} />}
            onClick={() => { actions.removeModel(parentUuid, model.uuid ?? model._key ?? model.id); close(); }}>
            Remove
          </Btn>
        )}
        <Btn variant="pri" style={{ marginLeft: 'auto' }} onClick={save} disabled={!id.trim()}>Save</Btn>
      </div>
    </aside>
  );
}

/**
 * A size, as presets plus an exact figure when none of them fits.
 *
 * A value that is not on the ladder selects Custom and shows the number, so a
 * model editor opened on a figure typed months ago still shows that figure
 * rather than silently rounding it to the nearest chip.
 */
function TokenField({ label, value, onChange, presets }: {
  label: string; value: number; onChange: (n: number) => void; presets: number[];
}) {
  const known = presets.includes(value);
  const [custom, setCustom] = useState(!known);
  const showInput = custom || !known;

  return (
    <Field label={label}>
      <Segmented
        value={showInput ? 'custom' : String(value)}
        onChange={v => {
          if (v === 'custom') { setCustom(true); return; }
          setCustom(false);
          onChange(Number(v));
        }}
        options={[
          ...presets.map(v => ({ value: String(v), label: _k(v) })),
          { value: 'custom', label: 'Custom' },
        ]}
        className="wrap"
      />
      {showInput && (
        <div className="inp mono" style={{ marginTop: 6 }}>
          <input
            type="number"
            min={1}
            step={1024}
            value={value || ''}
            onChange={e => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            aria-label={`${label} in tokens`}
            placeholder="393216"
          />
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--c-muted)' }}>tokens</span>
        </div>
      )}
    </Field>
  );
}

function _k(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

/** Pull the input (0) or output (1) figure out of a pricing string. */
function _price(pricing: string | undefined, which: 0 | 1): string {
  if (!pricing) return '';
  const nums = pricing.match(/\$([\d.]+)/g);
  return nums?.[which]?.replace('$', '') ?? '';
}
