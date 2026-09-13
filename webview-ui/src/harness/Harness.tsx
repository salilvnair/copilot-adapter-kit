/* ─────────────────────────────────────────────────────────────────────────────
 * Harness — the parity check for Phase 1.
 *
 * Renders every primitive plus one region lifted straight from the mock, so the
 * extracted stylesheet can be compared against the approved design before any
 * screen is built on it. Open it with: npm --prefix webview-ui run dev
 * ───────────────────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import * as I from '../icons';
import {
  AiBtn, Btn, Card, Chip, Crumb, EmptyState, Field, IconBtn, IconBtnGroup, Input,
  Meter, PageHead, Pane, PaneSplit, ProvMark, RailGroup, RailItem, Rule,
  SectionTitle, Segmented, SettingRow, Slider, Spark, Stepper, Switch, Tile,
} from '../ui';

export function Harness() {
  const [guard, setGuard] = useState(true);
  const [always, setAlways] = useState(false);
  const [tab, setTab] = useState<'staged' | 'all'>('staged');
  const [limit, setLimit] = useState(2_000_000);

  return (
    <>
      <Crumb
        trail={['Copilot Adapter Kit', 'Phase 1 parity harness']}
        right={<Chip tone="mute" mono>{'cak.css verbatim'}</Chip>}
      />

      <Pane>
        <PageHead
          title="Primitives"
          sub="every control the mock defines"
          right={
            <>
              <IconBtnGroup>
                <IconBtn icon={<I.Grid />} label="Grid view" on />
                <IconBtn icon={<I.Menu />} label="List view" />
              </IconBtnGroup>
              <IconBtn icon={<I.Refresh />} label="Reload" />
              <Btn variant="pri" icon={<I.Plus size={12} />}>Add provider</Btn>
            </>
          }
        />

        <SectionTitle right="six tones">Chips</SectionTitle>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip tone="ok" dot>Live</Chip>
          <Chip tone="warn" dot>No key</Chip>
          <Chip tone="err" dot>401 at 14:06</Chip>
          <Chip tone="mute" mono>118 ms</Chip>
          <Chip tone="pri">thinking</Chip>
          <Chip tone="info">vision</Chip>
        </div>

        <SectionTitle right="one height, never wrapping">Buttons</SectionTitle>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn variant="pri" icon={<I.Commit size={12} />}>Commit</Btn>
          <Btn icon={<I.Refresh size={12} />}>Test</Btn>
          <Btn variant="ghost">Reset counters</Btn>
          <Btn variant="danger">Clear all</Btn>
          <IconBtn icon={<I.ArrowUp />} label="Commit and push" />
          <IconBtn icon={<I.Copy />} label="Copy markdown" />
          <IconBtn icon={<I.Dots />} label="More" ghost />
          <AiBtn icon={<I.Sparkle />}>Generate</AiBtn>
        </div>

        <SectionTitle>Inputs</SectionTitle>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[{ value: 'staged', label: 'Staged' }, { value: 'all', label: 'All' }]}
          />
          <Stepper
            label="Daily token limit"
            value={`${(limit / 1e6).toFixed(2)}M`}
            onDec={() => setLimit(v => Math.max(0, v - 250_000))}
            onInc={() => setLimit(v => v + 250_000)}
          />
          <Slider pct={46} label="Diff threshold" />
          <Switch on={guard} onChange={setGuard} label="Spend guard" />
        </div>

        <Rule />

        <SectionTitle right="from the Spend Guard mock">Tiles</SectionTitle>
        <div className="sg-hero" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Tile label="Tokens today" value="2.00M" sub="of 2.00M">
            <Chip tone="err" dot className="self-start">Blocking</Chip>
          </Tile>
          <Tile label="Estimated cost" value="$18.42" sub="of $25.00 · 74%">
            <Meter pct={74} />
          </Tile>
          <Tile label="Requests" value="214" sub="17 blocked">
            <Spark bars={[6, 9, 7, 12, 8, 10, 6, 14]} label="Requests, last eight hours" />
          </Tile>
        </div>

        <SectionTitle right="from the Configuration mock">Setting rows</SectionTitle>
        <div>
          <SettingRow
            name="Max output tokens"
            desc="Sent as max_tokens. The Spend Guard applies its own ceiling on top, so output is never unbounded."
            modified
          >
            <Chip tone="ok">guard caps at 16K</Chip>
            <Stepper label="Max output tokens" value="0" />
          </SettingRow>
          <SettingRow
            name={<>Always preprocess images</>}
            desc="Costs one extra call per image on every turn, because nothing is cached between turns."
          >
            <Switch on={always} onChange={setAlways} label="Always preprocess images" />
          </SettingRow>
        </div>

        <SectionTitle right="from the Providers mock">Provider card</SectionTitle>
        <div className="prov-grid">
          <div className="prov">
            <div className="prov-h">
              <ProvMark>DS</ProvMark>
              <span className="prov-n">
                <span className="a">DeepSeek</span>
                <span className="b">api.deepseek.com/v1</span>
              </span>
              <span className="acts">
                <IconBtn icon={<I.Pencil />} label="Edit DeepSeek" ghost />
                <IconBtn icon={<I.Dots />} label="More actions" ghost />
              </span>
            </div>
            <div className="prov-meta">
              <Chip tone="ok" dot>Live</Chip>
              <Chip tone="mute" mono>118 ms</Chip>
              <Chip tone="mute">3 models</Chip>
              <Spark bars={[6, 9, 7, 12, 8, 10, 6, 14]} label="Requests today" />
            </div>
            <div className="prov-foot">
              <span style={{ color: 'var(--c-success)', display: 'flex' }}><I.Check size={11} width={2.4} /></span>
              Key in keychain
              <span style={{ marginLeft: 'auto' }} className="mono">1.21M today</span>
            </div>
          </div>

          <div className="prov warn">
            <div className="prov-h">
              <ProvMark>OR</ProvMark>
              <span className="prov-n">
                <span className="a">OpenRouter</span>
                <span className="b">openrouter.ai/api/v1</span>
              </span>
              <span className="acts">
                <IconBtn icon={<I.Pencil />} label="Edit OpenRouter" ghost />
                <IconBtn icon={<I.Dots />} label="More actions" ghost />
              </span>
            </div>
            <div className="prov-meta">
              <Chip tone="warn" dot>No key</Chip>
              <Chip tone="mute">2 models hidden</Chip>
            </div>
            <div className="prov-foot">
              <Btn icon={<I.Key size={11} />} style={{ height: 24, fontSize: 11 }}>Add key</Btn>
              <span style={{ marginLeft: 'auto' }}>Models stay hidden until set</span>
            </div>
          </div>
        </div>

        <SectionTitle>Rail</SectionTitle>
        <PaneSplit weight="right">
          <nav className="set-rail" style={{ borderRight: '1px solid var(--c-surface-border)' }}>
            <RailGroup>Connections</RailGroup>
            <RailItem icon={<I.Globe size={15} />} count={5} active>Providers</RailItem>
            <RailItem icon={<I.Grid size={15} />} count={12}>Models</RailItem>
            <RailItem icon={<I.Key size={15} />} count={4} countTone="ok">API Keys</RailItem>
            <RailGroup>Guard</RailGroup>
            <RailItem icon={<I.Shield size={15} />} count="92%" countTone="ok">Spend Guard</RailItem>
          </nav>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card header="Empty state">
              <EmptyState
                icon={<I.Branch size={20} />}
                title="No repository here"
                detail="Git AI writes commit messages from your working diff. Open a folder that is under version control to get started."
              >
                <span style={{ display: 'flex', gap: 7, marginTop: 4 }}>
                  <Btn variant="pri" icon={<I.Folder size={12} />}>Open folder</Btn>
                  <Btn>Init repo</Btn>
                </span>
              </EmptyState>
            </Card>

            <Card header="Drawer fields" right="measured width">
              <Field label="Family">
                <Input value="Groq" />
              </Field>
              <Field label="Base URL">
                <Input value="https://api.groq.com/openai/v1" mono focus />
              </Field>
              <Field label="API key">
                <Input placeholder="gsk_••••••••••••4b2f" />
              </Field>
            </Card>
          </div>
        </PaneSplit>
      </Pane>
    </>
  );
}
