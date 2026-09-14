/* Model editor — every field on one surface, with a live picker preview.
 *
 * This replaces an eight-step sequence of quick-picks that could not be walked
 * backwards: getting the context window wrong at step four meant starting over. */

import { useEffect, useState } from 'react';
import * as I from '../icons';
import { Btn, Chip, CloseBtn, Field, SectionTitle, Segmented, SettingRow, Stepper } from '../ui';
import { actions, mark, type AppState, type ModelCfg } from './state';

const CONTEXT = [4096, 8192, 16384, 32768, 65536, 128000, 200000, 400000, 1000000];
const OUTPUT = [4096, 8192, 16384, 32768, 65536, 128000];

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
        <Field label="Context">
          <Segmented
            value={String(maxIn)}
            onChange={v => setMaxIn(Number(v))}
            options={CONTEXT.map(v => ({ value: String(v), label: _k(v) }))}
            className="wrap"
          />
        </Field>
        <Field label="Max output">
          <Segmented
            value={String(maxOut)}
            onChange={v => setMaxOut(Number(v))}
            options={OUTPUT.map(v => ({ value: String(v), label: _k(v) }))}
            className="wrap"
          />
        </Field>

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
