/* Models — the catalog, grouped by provider.
 *
 * The switch on each row is what Copilot's picker reads: capability chips are
 * not decoration, they are the metadata that decides what the model is allowed
 * to do. Order here is the order in the picker. */

import { useMemo, useState } from 'react';
import * as I from '../../icons';
import { Btn, Chip, IconBtn, IconBtnGroup, PageHead, Spark } from '../../ui';
import { SidePanel } from '../../ui/SidePanel';
import { ModelDrawer } from '../ModelDrawer';
import {
  actions, fmtTokens, liveProviders, mark, modelsFor,
  type AppState, type ModelCfg, type ProviderCfg,
} from '../state';

export function Models({ state }: { state: AppState }) {
  const [filter, setFilter] = useState('');
  const [byUsage, setByUsage] = useState(false);
  const [editing, setEditing] = useState<{ parentUuid: string; model?: ModelCfg } | null>(null);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return liveProviders(state)
      .map(([uuid, p]) => {
        let models = modelsFor(state, uuid);
        if (q) {
          models = models.filter(m =>
            m.id.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q));
        }
        if (byUsage) {
          models = [...models].sort((a, b) =>
            _used(state, b) - _used(state, a));
        }
        return { uuid, p, models };
      })
      .filter(g => g.models.length > 0 || !q);
  }, [state, filter, byUsage]);

  const total = groups.reduce((n, g) => n + g.models.length, 0);
  const visible = groups.reduce(
    (n, g) => n + g.models.filter(m => !state.hiddenCustomModels.includes(`${m.family}:${m.id}`)).length,
    0,
  );

  const main = (
      <div className="set-main in-split">
        <PageHead
          title="Models"
          sub="what appears in the Copilot picker"
          right={
            <>
              <label className="search-f">
                <I.Search size={12} />
                <input value={filter} onChange={e => setFilter(e.target.value)}
                  placeholder="Filter" aria-label="Filter models" />
              </label>
              <IconBtnGroup>
                <IconBtn icon={<I.Menu />} label="Group by provider" on={!byUsage} onClick={() => setByUsage(false)} />
                <IconBtn icon={<I.Rows />} label="Sort by usage" on={byUsage} onClick={() => setByUsage(true)} />
              </IconBtnGroup>
              <Btn
                variant="pri"
                icon={<I.Plus size={12} />}
                onClick={() => {
                  const first = liveProviders(state)[0];
                  if (first) setEditing({ parentUuid: first[0] });
                }}
                disabled={liveProviders(state).length === 0}
              >
                Add model
              </Btn>
            </>
          }
        />

        <div>
          {groups.map(({ uuid, p, models }) => (
            <Group
              key={uuid}
              uuid={uuid}
              p={p}
              models={models}
              state={state}
              onEdit={m => setEditing({ parentUuid: uuid, model: m })}
              onAdd={() => setEditing({ parentUuid: uuid })}
            />
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--c-muted)', display: 'flex', gap: 7, alignItems: 'center' }}>
          <I.Info size={12} />
          {total} model{total === 1 ? '' : 's'}, {visible} in the picker. The switch writes{' '}
          <span className="mono">hiddenCustomModels</span>.
        </div>
      </div>
  );

  return (
    <SidePanel
      main={main}
      panel={editing ? (
        <ModelDrawer
          state={state}
          parentUuid={editing.parentUuid}
          model={editing.model}
          close={() => setEditing(null)}
        />
      ) : undefined}
      panelPx={400}
    />
  );
}

function Group({
  uuid, p, models, state, onEdit, onAdd,
}: {
  uuid: string;
  p: ProviderCfg;
  models: ModelCfg[];
  state: AppState;
  onEdit: (m: ModelCfg) => void;
  onAdd: () => void;
}) {
  const spend = models.reduce((n, m) => n + _used(state, m), 0);
  const h = state.health[uuid];

  return (
    <>
      <div className="grp-h">
        <span className="prov-mark" style={{ width: 18, height: 18, fontSize: 9, borderRadius: 5 }}>
          {mark(p)}
        </span>
        {p.name || p.family}
        {h?.authFailedAt
          ? <Chip tone="err" style={{ height: 16, fontSize: 9.5 }}>key rejected</Chip>
          : <Chip tone="mute" style={{ height: 16, fontSize: 9.5 }}>{models.length}</Chip>}
        <span className="line" />
        {spend > 0 && (
          <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10.5 }}>
            {fmtTokens(spend)} today
          </span>
        )}
      </div>

      {models.length === 0 && (
        <div style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--c-muted)', display: 'flex', gap: 9, alignItems: 'center' }}>
          No models yet.
          <Btn style={{ height: 24, fontSize: 11 }} icon={<I.Plus size={11} width={2.4} />} onClick={onAdd}>
            Add one
          </Btn>
        </div>
      )}

      {models.map(m => (
        <ModelRow key={m.uuid ?? m._key ?? m.id} m={m} state={state} onEdit={() => onEdit(m)} />
      ))}
    </>
  );
}

function ModelRow({ m, state, onEdit }: { m: ModelCfg; state: AppState; onEdit: () => void }) {
  const hidden = state.hiddenCustomModels.includes(`${m.family}:${m.id}`);
  const usage = state.usageByModel[m.id];
  const win = `${_k(m.maxIn ?? 128000)} → ${_k(m.maxOut ?? 16384)}`;

  return (
    <div className={`mrow${hidden ? ' off' : ''}`}>
      <span className="grip"><I.Grip size={11} /></span>

      <span className="nm">
        <span className="a">{m.name || m.id}</span>
        <span className="b">{m.id}</span>
      </span>

      <span className="caps">
        <Chip tone="mute" mono>{win}</Chip>
        {m.image && <Chip tone="info">vision</Chip>}
        {m.thinking && <Chip tone="pri">thinking</Chip>}
        {m.apiPath && <Chip tone="pri" mono>{m.apiPath}</Chip>}
        {m.toolCalling ? <Chip tone="mute">tools {m.toolCalling}</Chip> : null}
        {m.pricing && <Chip tone="ok" mono>{m.pricing}</Chip>}
        {hidden && <Chip tone="mute">hidden from picker</Chip>}
      </span>

      <span className="rt">
        {usage?.requests ? (
          <Spark bars={[usage.requests, usage.inputTokens / 1000, usage.outputTokens / 100]} label="Usage today" />
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={!hidden}
          aria-label={`Show ${m.name || m.id} in the picker`}
          className={`sw${hidden ? '' : ' on'}`}
          onClick={() => actions.toggleModelVisible(m.id, m.family)}
        />
        <IconBtn icon={<I.Pencil />} label={`Edit ${m.name || m.id}`} ghost onClick={onEdit} />
      </span>
    </div>
  );
}

function _k(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

function _used(state: AppState, m: ModelCfg): number {
  const u = state.usageByModel[m.id];
  return u ? u.inputTokens + u.outputTokens : 0;
}
