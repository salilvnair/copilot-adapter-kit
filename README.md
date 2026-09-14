<h1 align="center">
  <img src="resources/icon.png" width="64" alt="CAK"/>
  <br/>
  Copilot Adapter Kit
</h1>

<p align="center">
  <strong>Any model. Every provider. One picker.</strong><br/>
  <em>Plugin-based provider mesh for GitHub Copilot Chat.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"/>
  <img src="https://img.shields.io/badge/vscode-^1.116.0-007ACC?logo=visualstudiocode" alt="VS Code"/>
  <img src="https://img.shields.io/badge/node-≥24-green?logo=node.js" alt="Node"/>
</p>

---

Copilot Adapter Kit brings any model into GitHub Copilot Chat — OpenAI, Anthropic (native Messages API), Ollama, LM Studio, vLLM, Groq, Fireworks, Together AI, DeepSeek, or your own self-hosted endpoint. All at once, side-by-side in the model picker.

Agent mode. Tool calling. Streaming. Vision fallback. Thinking blocks. Rate-limit retry. Error mapping. Request diagnostics. All built in.

---

## Getting Started

### Quickstart

```jsonc
// settings.json
{
  "copilot-adapter-kit.providers": {
    "openai": { "baseUrl": "https://api.openai.com/v1" }
  }
}
```

1. **Cmd+Shift+P** → `Copilot Adapter Kit: Set API Key` → pick `openai` → paste your key
2. Click **CAK** in the status bar → **Add Model** → enter model id, name, family
3. **Cmd+Shift+I** → Copilot Chat → pick your model from the dropdown
4. Chat.

### Open the Settings Panel

Click **CAK** in the status bar, or run `Copilot Adapter Kit: Open Panel` from the command palette.

The panel has tabs:
- **Providers** — add/edit/remove API endpoints
- **Models** — add/edit/remove models visible in the picker
- **Keys** — manage API keys per provider
- **Configuration** — log level, vision fallback, prompts, tool stabilization
- **Request Dumps** — full payload logs for debugging

---

## Consumer Guide

### Providers

Add one or more providers. Each provider needs a family name and a base URL.

**In the panel:** Providers tab → choose family → enter base URL → Add.

Each provider gets its own API key. Set keys in the Keys tab or via `Copilot Adapter Kit: Set API Key`.

#### Provider Families

| Family | Default Base URL |
|---|---|
| `openai` | `https://api.openai.com/v1` |
| `deepseek` | `https://api.deepseek.com/v1` |
| `groq` | `https://api.groq.com/openai/v1` |
| `fireworks` | `https://api.fireworks.ai/inference/v1` |
| `together` | `https://api.together.xyz/v1` |
| `openrouter` | `https://openrouter.ai/api/v1` |
| `mistral` | `https://api.mistral.ai/v1` |
| `xai` | `https://api.x.ai/v1` |
| `ollama` | `http://localhost:11434/v1` |
| `lmstudio` | `http://localhost:1234/v1` |
| `vllm` | `http://localhost:8000/v1` |
| `custom` | (you define it) |

#### Model Aliases

If your provider uses different model names than what you want in the picker:

```jsonc
{
  "copilot-adapter-kit.providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "modelAlias": {
        "llama3-8b": "llama3.1:8b-instruct-q8_0"
      }
    }
  }
}
```

The picker shows `llama3-8b` but the API receives `llama3.1:8b-instruct-q8_0`.

### Models

All models are user-defined. Add them in the Models tab or via `copilot-adapter-kit.models` in settings.

| Field | Required | Description |
|---|---|---|
| `id` | ✅ | Model ID sent to the API (e.g. `gpt-5.2`, `deepseek-chat`) |
| `family` | ✅ | Must match a provider family name |
| `name` | — | Display name in the picker. Defaults to `id`. |
| `maxIn` | — | Max input tokens. Default `128000`. |
| `maxOut` | — | Max output tokens. Default `16384`. |
| `image` | — | Model supports vision. Default `true`. |
| `thinking` | — | Model supports reasoning tokens. Default `false`. |
| `toolCalling` | — | Max parallel tool calls. Default `128`. |
| `apiPath` | — | Per-model API path override (e.g. `/responses`). |
| `visionFallback` | — | Per-model vision fallback. Format: `family:modelId`. |
| `pricing` | — | Cost display. Use structured format for best results. |

#### Pricing Display

Pricing appears in two places — the **model picker subtitle** and the **model details panel** (click the model in the picker).

**Structured format** (recommended) — parsed into separate Input / Output / Cache rows in the details panel:

```
in $0.14 / out $0.28 / cache $0.0028
$0.14/$0.28 (cache $0.0028)
$0.14 → $0.28 | cache $0.0028
```

**Simple format** — shown as a single row:

```
$0.14/$0.28
```

In the picker subtitle it always shows as a compact badge: `💰 $0.14 → $0.28 | cache $0.0028/1M`

### Vision Fallback

When a model doesn't support images, CAK can route images through a vision-capable model and send the text description to your primary model.

#### How it works

1. CAK reports to VS Code that the model can handle images (so attachments aren't blocked)
2. When you attach an image, the bridge detects it
3. The image is sent to a **vision fallback model** for description
4. The text description replaces the image before reaching your primary model

#### Configuration

**Global fallback model** — set in the Configuration tab:
- **Vision Fallback** dropdown: pick any Copilot or CAK model
- **Always preprocess images through fallback** checkbox: forces fallback for all models when on

**Per-model fallback** — set in the Models tab when adding/editing a model:
- **Vision Fallback** dropdown: overrides the global setting for that specific model

#### Trigger conditions

| Fallback always | Model `image` flag | Behavior |
|---|---|---|
| OFF (default) | `true` | Images sent directly to model |
| OFF (default) | `false` | Fallback runs automatically |
| ON | any | Fallback always runs |

### Thinking Models & Reasoning

Models with `thinking: true` support reasoning tokens. VS Code shows a glow animation for thinking blocks.

CAK persists the chain-of-thought across conversation turns. When a thinking model responds, its reasoning is captured and re-injected as `reasoning_content` in the next API call. This preserves reasoning context.

Configure `reasoningEffort` (None / High / Max) per-model in VS Code's model configuration dropdown.

### Prompts

Customize the system prompt and user message template in the Configuration tab:

- **System Prompt** — injected as the first message. Supports placeholders: `{model}`, `{date}`, `{tools}`, `{cakVersion}`.
- **User Prompt Template** — wraps user messages. Use `{userMessage}` as the placeholder.

### Logging & Diagnostics

| Level | What you get |
|---|---|
| `quiet` | Nothing in output channel (default) |
| `meta` | Request fingerprints, message diffs, cache trace |
| `dump` | Meta + full request payloads written to disk |

Access logs via `Copilot Adapter Kit: Show Logs`. View dumps via `Copilot Adapter Kit: Open Dumps Folder`.

### Tool Stabilization

When you see "tool list is unstable" warnings, enable `stabilizeTools` in the Configuration tab. This pre-activates VS Code tools to lock the tools array across conversation turns, improving cache prefix stability.

---

## Audit log

Every model call is recorded to a local SQLite database — sql.js compiled to WASM, so there
is no native build step and it runs the same everywhere. One row per call: which model
answered, how many tokens each way, what it cost, how long it took, and the reason if the
Spend Guard refused it. Panel actions are recorded alongside them.

| Setting | Default | |
|---|---|---|
| `audit.enabled` | `true` | Record calls at all |
| `audit.recordBodies` | **`false`** | Also record prompts and responses |
| `audit.retentionDays` | `30` | Prune older rows at startup; `0` keeps everything |
| `audit.dbPath` | `~/.salilvnair/copilot-adapter-kit/db/cak.db` | Where it lives |

**Bodies are off by default and that is deliberate.** For this extension the payload is your
source code and your prompts, so an audit file holding it is a different proposition to one
holding timings and token counts. Keys are never recorded either way, and neither are
request headers — only the API path. If SQLite fails to start, the extension carries on and
the screen says so.

## Screens

Every screen, tab and overlay is captured in [`docs/screenshots/`](docs/screenshots) —
regenerate the set with `node scripts/screenshots.mjs`.

## Webview UI

The panels are built from `webview-ui/` — React 19 + Vite 6 + Tailwind 4, with
[`@salilvnair/dui`](https://www.npmjs.com/package/@salilvnair/dui) 1.0.8 available for
behaviour-heavy widgets. Three entries build into `media/dist/`, one per surface:
`settings`, `spend-guard` and `sidebar`.

| Command | What it does |
|---|---|
| `npm run install:webview` | Install the webview dependencies (once, after cloning) |
| `npm run build:webview` | Build the bundles into `media/dist/` |
| `npm run watch:webview` | Vite dev server with hot reload, for working on a screen |
| `npm run compile` | Webview build + `tsc` — what F5 and packaging use |
| `npm run typecheck` | Type-checks the extension and the webview |
| `npm test` | Compiles, then runs the spend-guard, webview-host, message-contract and audit-database suites |
| `npm run test:e2e` | Playwright drives every screen in a real browser |
| `npm run test:all` | Both of the above |

Every surface is built: the settings shell with Providers, Models and API Keys; the
Spend Guard dashboard and its history; Configuration, Git Tools, JSON, Request Dumps,
Dev Tools, Bin and the Danger Zone; and the Git AI sidebar.

`src/styles/cak.css` is **extracted verbatim from the approved UI mock** and is the
specification, not a starting point. Components in `src/ui/` emit that markup unchanged,
so what renders is what was signed off. Add a primitive rather than restyling inline.

There are no emoji anywhere in the UI. They render differently on every platform, sit off
the baseline of the text beside them, and cannot take the theme's colour — the stroked set
in `src/icons.tsx` replaces them.

Run **Copilot Adapter Kit: Open UI Parity Harness** from an Extension Development Host to
render every primitive side by side against the mock. It is registered only in development.

**Tests run locally, not in CI.** Nothing here is wired to GitHub Actions — the only
workflow is the publish job on a `v*` tag. Run `npm run test:all` before pushing.

`webview-ui/e2e/` drives the real screens in Chromium against the Vite dev server: filters
narrow lists, menu entries fire, a destructive action asks before it acts, a hold has to be
held, the drawer opens at 330 px and drags. They assert behaviour, not screenshots, so they
do not break when a colour changes. First run needs the browser:
`npx --prefix webview-ui playwright install chromium`.

`test/message-contract.test.js` checks that every message the UI can post has a handler
on the extension side, and that no action or handler has gone stale. That is the failure
the tests exist to prevent: a control that looks fine and silently does nothing.

`npm run watch:webview` serves the screens in a plain browser for design work. With no
extension host to answer, they fall back to sample data from `src/app/fixture.ts` — every
such page carries an amber **Sample data** bar, and the fixture is dropped from the
production bundle by `import.meta.env.DEV`.

---

## Spend Guard

BYOK means the bill is yours. GitHub Copilot ships with a ceiling you have to deliberately raise; this adapter does the same, and it is **on by default**.

Every request is checked *before it leaves your machine*. A blocked request is never sent, so it costs nothing.

| Limit | Default | What it stops |
|---|---|---|
| `budget.dailyTokenLimit` | `2,000,000` tokens/day | Total input + output across all providers |
| `budget.dailyCostLimitUsd` | `$25`/day | Estimated spend, from each model's `pricing` string |
| `budget.maxInputTokensPerRequest` | `200,000` tokens | One oversized request blowing the budget |
| `budget.maxOutputTokens` | `0` → the model's `maxOut` | Unbounded generation — output is **never** uncapped |
| `budget.maxTurnsPerConversation` | `50` requests | **Runaway agent loops** |

That last one matters most. In agent mode every tool round-trip resends the whole conversation, so a loop left running overnight can burn tens of millions of tokens on its own. The turn guard cuts it off.

Usage is recorded from the provider's own usage stream where available, and from a deliberately conservative estimate where it is not. The status bar shows today's total; click it for a per-model breakdown.

```
$(cak-icon) 412.3K · $1.87        ← normal
$(cak-icon) 1.71M · $22.40        ← amber at 80%
$(cak-icon) 2.00M · $25.00        ← red, requests blocked
$(cak-icon) ⚠ UNCAPPED 8.4M       ← red, no protection at all
```

### Turning it off

`Copilot Adapter Kit: Disable Spend Guard` removes every limit above. It requires a modal confirmation *and* typing `DISABLE`, and the status bar stays red for as long as protection is off. Only do this when you are watching the run.

Re-enable with `Copilot Adapter Kit: Enable Spend Guard`, or from the **Spend Guard** tab in the panel.

### Limits are per calendar day

Counters reset at local midnight. `Copilot Adapter Kit: Reset Today's Usage` zeroes them early — it clears the local counters only; your provider has still billed what was already spent.

Set any limit to `0` to disable that one check individually while leaving the rest in force.

---

## Commands

All commands available via `Cmd+Shift+P` under `Copilot Adapter Kit:`.

| Command | Description |
|---|---|
| **Open Panel** | Full settings UI — providers, models, keys, config |
| **Set API Key** | Store a provider API key in OS keychain |
| **Clear API Key** | Remove a provider's API key |
| **Add Provider** | Step-by-step wizard |
| **Remove Provider** | Cascade deletes provider + models + key |
| **Add Model** | Step-by-step form with dropdowns |
| **Remove Model** | Pick a model to remove |
| **Open Settings** | Jump to raw JSON settings |
| **Show Logs** | Open the output channel |
| **Open Dumps Folder** | Reveal request dumps in Finder |
| **Show Token Usage** | Today's spend, per model, with the active limits |
| **Reset Today's Usage** | Zero the local usage counters |
| **Disable Spend Guard** | ⚠️ Remove all spend limits (double confirmation) |
| **Enable Spend Guard** | Restore the default protection |

---

## Architecture

```
Copilot Chat (VS Code)
       │
       ▼
  CopilotBridge
  Model → family → provider config + key → engine
  Vision fallback, prompt templates, tool stabilization
       │
       ▼
  Pipeline (Interceptor Chain)
  RateLimitGuard → ErrorWarden → DiagTracer
       │
       ▼
  ProviderDiscovery (Engine Registry)
  OpenAIEngine (OpenAI-compat) | AnthropicEngine (native Messages API)
       │
       ▼
  Provider API
```

### Design Patterns

| Pattern | Where |
|---|---|
| **SPI** | `Engine` interface — every backend implements it |
| **IoC** | `Context` — single bootstrapper wires all services |
| **AOP** | `Pipeline` — interceptor chain wraps every engine call |
| **Factory** | `ProviderDiscovery` — register engines, lookup at runtime |
| **Strategy** | Per-family `ProviderConfig` with optional model aliases |

---

## Developer Guide

### Prerequisites

```bash
nvm use 22           # Node ≥22
npm install           # Install dependencies
npm run watch         # Compile + watch
```

### Project Structure

```
src/
├── entry.ts                          # VS Code activate/deactivate
├── kernel/
│   ├── context.ts                    # IoC container — boots everything
│   ├── vault.ts                      # OS keychain per-family API keys
│   ├── tuning.ts                     # Typed settings accessors (providers, models, visionFallback, prompts)
│   └── families.ts                   # 13 provider family presets with default URLs
├── conduit/
│   ├── copilot-bridge.ts             # LanguageModelChatProvider — main request handler
│   ├── model-catalog.ts              # Model metadata registry + VS Code capability reporting
│   └── replay.ts                     # Chain-of-thought stash/replay for thinking models
├── mesh/
│   ├── contract.ts                   # Engine SPI, Payload, Envelope, StreamEvents, ToolDef
│   ├── discovery.ts                  # Provider registry (AnthropicEngine + OpenAIEngine × families)
│   ├── pipeline.ts                   # AOP interceptor chain (RateLimitGuard → ErrorWarden → DiagTracer)
│   └── engines/
│       ├── anthropic/
│       │   ├── anthropic-engine.ts   # Native Anthropic Messages API — SSE streaming
│       │   └── anthropic-wire-format.ts  # Envelope[] → Anthropic request (system, tool_use, tool_result)
│       └── openai/
│           ├── openai-engine.ts      # OpenAI Chat Completions — SSE streaming (used by 12 families)
│           └── openai-wire-format.ts # VS Code messages → OpenAI JSON (forgeEnvelopes, forgeTools)
├── crosscut/
│   ├── rate-limit-guard.ts           # 429 auto-retry ×3 with thinking block progress
│   ├── error-warden.ts               # HTTP + network error → friendly chat messages
│   ├── diag-tracer.ts                # Request logging, fingerprinting, JSON dumps, vision audit
│   ├── insight-engine.ts             # Request fingerprint hashing & diff detection
│   └── tool-stabilizer.ts            # Tool pre-activation to lock tools array across turns
├── panel/
│   └── SettingsPanel.ts              # Webview panel — builds state + handles config save messages
└── tooling/
    └── token-math.ts                 # Approximate token counting
media/
└── settings-panel.html               # Full settings UI — Providers, Models, Keys, Config, Dumps, Danger Zone
```

### Key Concepts

**CopilotBridge** (`conduit/copilot-bridge.ts`) — the single `LanguageModelChatProvider` VS Code sees. Flow:

1. Resolves selected model → metadata (`ModelMeta`) + family
2. Loads provider config (base URL) and API key from the vault
3. Applies custom system prompt and user message template if configured
4. Detects image parts → runs vision fallback if configured (global or per-model)
5. Builds the abstract `Payload` (Envelope[] + ToolDef[])
6. Runs it through the interceptor pipeline to the engine
7. Streams tokens, thinking blocks, and tool calls back to VS Code
8. Stashes chain-of-thought for thinking models on completion

**ModelCatalog** (`conduit/model-catalog.ts`) — loads user-defined models from `copilot-adapter-kit.models`. Reports capabilities to VS Code:
- `imageInput: true` when: model supports images natively, OR per-model `visionFallback` is set, OR global `visionFallbackModel` is set
- `imageInput: false` only when no fallback is configured → VS Code shows native warning

**Settings Panel** (`panel/SettingsPanel.ts` + `media/settings-panel.html`) — full webview UI with tabs:
- **Providers** — add/edit/remove provider endpoints with family presets (auto-fills default URLs)
- **Models** — add/edit/remove models; fields for id, name, family, context window, API path, vision, thinking, tools, pricing, per-model vision fallback
- **Keys** — set/clear API keys per provider, stored in OS keychain
- **Configuration** — log level, vision fallback model (grouped dropdown: Copilot + CAK models), always-preprocess toggle, system prompt, user prompt template, tool stabilization
- **Request Dumps** — list of saved JSON payloads from `dump` log level
- **Danger Zone** — reset all settings, hide built-in models

**Vision Fallback Flow:**

```
User attaches image
        │
        ▼
VS Code checks imageInput capability (set by ModelCatalog)
  ─ true → image reaches bridge
  ─ false → VS Code blocks image at UI level
        │
        ▼
Bridge: _hasImageParts() detects image parts
        │
        ▼
shouldFallback = hasImages && hasFallbackModel && (visionFallbackAlways || !modelSupportsImages)
        │
        ▼
_applyVisionFallback() routes each image:
  ─ copilot:* → _describeViaCopilot() (native vscode.lm.selectChatModels)
  ─ family:* → _describeViaEngine() (routes through CAK engine, non-streamed)
        │
        ▼
Image replaced with text description in message payload
        │
        ▼
Primary model receives text-only messages
```

**Thinking Stash/Replay:**

When a thinking model responds, chain-of-thought is captured and packed as a binary `x-cak/chain` message part (magic header + compressed payload). On the next turn, `openai-wire-format.ts` detects the stash via `unpackStash()` and injects `reasoning_content` into the API payload. Preserves reasoning context across conversation turns.

### Adding a New Engine

Two approaches depending on the provider's API:

**OpenAI-compatible** (Groq, Fireworks, Together, DeepSeek, Ollama, LM Studio, etc.) — no code needed. Just add a family in `families.ts` and it auto-routes through `OpenAIEngine`.

**Non-OpenAI API** (example: native Anthropic) — implement the `Engine` SPI:

1. **Create wire format** in `src/mesh/engines/{family}/{family}-wire-format.ts`:
```typescript
export function toMyApiRequest(payload: Payload): MyApiRequest {
  // Convert abstract Envelope[] + ToolDef[] → provider-specific JSON
}
```

2. **Create engine** in `src/mesh/engines/{family}/{family}-engine.ts`:
```typescript
import { Engine, Payload, StreamEvents } from '../../contract';

export class MyEngine implements Engine {
  readonly family = 'myfamily';
  configure(endpoint: string, key: string): void { ... }
  async stream(req: Payload, sink: StreamEvents, signal?: AbortSignal): Promise<void> {
    // Call toMyApiRequest(req), fetch(), stream SSE, emit sink events
  }
}
```

3. **Register** in `src/mesh/discovery.ts`:
```typescript
this.register(new MyEngine());
```

4. **Add family preset** in `src/kernel/families.ts` (optional).

### Adding a New Interceptor

```typescript
import type { Interceptor } from '../mesh/pipeline';

export class MyInterceptor implements Interceptor {
  async intercept(payload, engine, sink, signal, next) {
    await next();  // Call the chain
  }
}
```

Register in `Context.bootstrap()`: `ctx.pipeline.use(new MyInterceptor());`

### Key Design Decisions

- **Two-engine architecture.** `AnthropicEngine` for native Anthropic Messages API; `OpenAIEngine` for all 12 OpenAI-compatible families. Both implement the same `Engine` SPI.
- **Abstract wire format.** Bridge produces abstract `Envelope[]` + `ToolDef[]`; each engine's wire format translates to provider-specific JSON.
- **Per-family API keys** in OS keychain. No shared keys, no fallback.
- **Compile-time engine registration.** Engines registered in `ProviderDiscovery`, not from config. Prevents arbitrary code execution.
- **Inline error reporting.** Errors rendered as `LanguageModelTextPart` in chat, not thrown as exceptions.
- **Thinking blocks** use `LanguageModelThinkingPart` (proposed API) with ID `cak-thinking`.
- **Fully awaited async interceptor chains.** Critical for 429 retry correctness.

---

## Settings Reference

All settings under `copilot-adapter-kit.*`.

### `providers`

```jsonc
{
  "copilot-adapter-kit.providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "name": "My OpenAI",
      "defaultApiPath": "/chat/completions",
      "modelApiPaths": { "codex-5.3": "/responses" },
      "modelAlias": { "gpt-4o": "gpt-4o-2024-08-06" },
      "visionFallback": "openai:gpt-5.2"
    }
  }
}
```

### `budget.*`

Spend Guard limits — see [Spend Guard](#spend-guard).

```jsonc
{
  "copilot-adapter-kit.budget.enforce": true,
  "copilot-adapter-kit.budget.dailyTokenLimit": 2000000,
  "copilot-adapter-kit.budget.dailyCostLimitUsd": 25,
  "copilot-adapter-kit.budget.maxInputTokensPerRequest": 200000,
  "copilot-adapter-kit.budget.maxOutputTokens": 0,
  "copilot-adapter-kit.budget.maxTurnsPerConversation": 50
}
```

### `models`

Array of model definitions. See [Models](#models) section for schema.

### `visionFallbackModel`

Global vision fallback model. Format: `family:modelId` or just `modelId`. Empty = disabled.

### `visionFallbackAlways`

Default: `false`. When `true`, always preprocess images through fallback regardless of model's `image` flag.

### `maxTokens`

Max output tokens. `0` = no limit (provider default applies).

### `logLevel`

`quiet` (default), `meta`, or `dump`.

### `stabilizeTools`

Default: `false`. Pre-activates tools to stabilize the tools array.

### `systemPrompt`

Custom system prompt template. Placeholders: `{model}`, `{date}`, `{tools}`, `{cakVersion}`.

### `userPromptTemplate`

User message wrapper. Use `{userMessage}` placeholder.

### `hiddenCustomModels`

Managed by the Panel UI when you hide models. No JSON editing needed.

---

## Troubleshooting

### "Model does not support images" warning in chat

VS Code shows this when `imageInput: false`. CAK reports `imageInput: true` if a vision fallback is configured. If you still see this:
- Set a vision fallback model (global or per-model)
- Reload the extension host after changes

### Image sends but model returns errors

Check that your vision fallback model actually supports images. If it's also text-only, CAK shows `[image — vision fallback failed]` in the response. Use a known vision-capable model as fallback (e.g. `copilot:gpt-5.2` or `openai:gpt-5.2`).

### Model not showing in picker

1. Model's `family` must match a key in `providers`
2. API key must be set for that family
3. Reload window after adding

### "No API key configured" warning

Run `Copilot Adapter Kit: Set API Key` and select the provider.

### "No baseUrl configured" error

Add the provider to `copilot-adapter-kit.providers` with a valid `baseUrl`.

### 429 Rate Limit

CAK auto-retries 3 times with exponential backoff. If it persists, reduce request frequency or upgrade your provider tier.

### Connection refused (Ollama/LM Studio)

Verify the local server is running:
```bash
curl http://localhost:11434/v1/models   # Ollama
curl http://localhost:1234/v1/models    # LM Studio
```

---

## License

MIT © [salilvnair](https://github.com/salilvnair)
