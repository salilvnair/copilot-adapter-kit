<h1 align="center">
  <img src="resources/icon.png" width="64" alt="CAK"/>
  <br/>
  Copilot Adapter Kit
</h1>

<p align="center">
  <strong>Plugin &middot; Mesh &middot; Deploy</strong><br/>
  <em>Any model. Every provider. One picker. Zero compromise.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"/>
  <img src="https://img.shields.io/badge/vscode-^1.116.0-007ACC?logo=visualstudiocode" alt="VS Code"/>
  <img src="https://img.shields.io/badge/node-≥24-green?logo=node.js" alt="Node"/>
</p>

---

**Copilot Adapter Kit** brings **any OpenAI‑compatible model** into GitHub Copilot Chat — OpenAI, Ollama, LM Studio, vLLM, Groq, Fireworks, Together AI, or your own self‑hosted endpoint. All at once, side‑by‑side in the model picker.

Agent mode. Tool calling. Streaming. Vision. Thinking blocks. Built‑in 429 retry, error mapping, diagnostics, and request dumps. Zero code changes when adding new providers — just JSON config.

> **One extension. Every backend. Zero friction.**

---

## ⚡ 30‑Second Setup

```jsonc
// settings.json
{
  "copilot-adapter-kit.providers": {
    "openai": { "baseUrl": "https://api.openai.com/v1" }
  }
}
```

```
1. Cmd+Shift+P → "Copilot Adapter Kit: Set API Key" → pick "openai" → paste sk-...
2. Click **$(cak-icon) CAK** in the status bar → configure providers, models & keys
3. Cmd+Shift+I → Copilot Chat → pick "GPT-5.5" from the model dropdown
4. Chat. Done.
```

---

## 📋 Table of Contents

- [Providers & Recipes](#-providers--recipes)
  - [OpenAI](#openai)
  - [Ollama](#ollama)
  - [LM Studio](#lm-studio)
  - [Any OpenAI‑Compatible Provider](#any-openai-compatible-provider)
  - [Multiple Providers at Once](#multiple-providers-at-once)
- [Manage Models](#-manage-models)
- [Architecture](#-architecture)
- [Settings Reference](#-settings-reference)
- [Commands Reference](#-commands-reference)
- [Interceptors (Built‑in Middleware)](#-interceptors)
- [Developer Guide](#-developer-guide)
  - [Project Structure](#project-structure)
  - [Adding a New Engine](#adding-a-new-engine)
  - [Adding a New Interceptor](#adding-a-new-interceptor)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#license)

---

## 🌐 Providers & Recipes

Copilot Adapter Kit uses a **family‑based routing model**. Each provider family gets its own endpoint, API key, and optional model aliases. The bridge resolves `model → family → provider config + key → engine` automatically.

### OpenAI

The default family. Uses the OpenAI Chat Completions API over SSE streaming.

```jsonc
// settings.json
{
  "copilot-adapter-kit.providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "modelAlias": {
        "gpt-4o": "gpt-4o-2024-08-06"
      }
    }
  }
}
```

```
Cmd+Shift+P → "Copilot Adapter Kit: Set API Key" → pick "openai" → paste sk-...
```

**What you get:**
- GPT-5.5, GPT-5.4, GPT-5.4-mini, GPT-5.4-nano, and Codex 5.3 in the Copilot picker (built‑in)
- Vision (paste screenshots into chat)
- Tool calling (Agent mode)
- 128 tool limit, up to 1M context

---

### Ollama

Run models locally via Ollama's OpenAI‑compatible endpoint. No API key needed, no data leaves your machine.

**Step 1:** Install & start Ollama

```bash
# macOS
brew install ollama
ollama serve

# Pull a model
ollama pull llama3.1:8b-instruct-q8_0
ollama pull qwen2.5-coder:14b
```

**Step 2:** Configure the provider

```jsonc
{
  "copilot-adapter-kit.providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "modelAlias": {
        "llama3-8b": "llama3.1:8b-instruct-q8_0",
        "qwen-coder": "qwen2.5-coder:14b"
      }
    }
  }
}
```

**Step 3:** Register models in the picker

```jsonc
{
  "copilot-adapter-kit.models": [
    {
      "id": "llama3-8b",
      "name": "Llama 3.1 8B",
      "family": "ollama",
      "detail": "Local Llama 3.1 8B Instruct Q8_0",
      "maxIn": 128000,
      "maxOut": 8192,
      "toolCalling": 64
    },
    {
      "id": "qwen-coder",
      "name": "Qwen 2.5 Coder 14B",
      "family": "ollama",
      "detail": "Local Qwen 2.5 Coder 14B",
      "maxIn": 32768,
      "maxOut": 8192,
      "toolCalling": 64,
      "image": false
    }
  ]
}
```

**Step 4:** Set a dummy API key (Ollama requires one but ignores it)

```
Cmd+Shift+P → "Copilot Adapter Kit: Set API Key" → pick "ollama" → type "ollama"
```

**Step 5:** Select your local model from the Copilot Chat picker and start chatting.

> 💡 **Tip for large models:** Set `"maxOut": 8192` or lower to avoid timeouts. Use `"toolCalling": 64` for smaller models that struggle with many tools.

---

### LM Studio

LM Studio exposes an OpenAI‑compatible server on port 1234. Same pattern as Ollama.

**Step 1:** Install [LM Studio](https://lmstudio.ai), download a model, and start the local server.

- Go to the **Developer** tab (or **Local Server** tab)
- Select your model
- Click **Start Server** (default: `http://localhost:1234`)

**Step 2:** Configure

```jsonc
{
  "copilot-adapter-kit.providers": {
    "lmstudio": {
      "baseUrl": "http://localhost:1234/v1"
    }
  },
  "copilot-adapter-kit.models": [
    {
      "id": "qwen-coder",
      "name": "Qwen 2.5 Coder",
      "family": "lmstudio",
      "detail": "Local via LM Studio",
      "maxIn": 32768,
      "maxOut": 8192,
      "toolCalling": 64,
      "image": false
    }
  ]
}
```

**Step 3:** Set a dummy key

```
Cmd+Shift+P → "Copilot Adapter Kit: Set API Key" → pick "lmstudio" → type "lmstudio"
```

**Step 4:** Pick your model in Copilot Chat and go.

> ⚠️ **LM Studio note:** The model ID you configure (`"qwen-coder"`) must match the model loaded in LM Studio's server. Use `"modelAlias"` if the LM Studio model name differs from what you want in the picker.

---

### Any OpenAI‑Compatible Provider

The `openai` engine speaks the standard OpenAI Chat Completions API. Any provider that implements `/v1/chat/completions` with SSE streaming works out of the box:

| Provider | Base URL |
|---|---|
| **Groq** | `https://api.groq.com/openai/v1` |
| **Fireworks** | `https://api.fireworks.ai/inference/v1` |
| **Together AI** | `https://api.together.xyz/v1` |
| **DeepSeek** | `https://api.deepseek.com/v1` |
| **vLLM** (self‑hosted) | `http://your-server:8000/v1` |
| **OpenRouter** | `https://openrouter.ai/api/v1` |
| **Mistral** | `https://api.mistral.ai/v1` |
| **xAI Grok** | `https://api.x.ai/v1` |
| **Your own proxy** | `https://your-proxy.example.com/v1` |

**Generic recipe:**

```jsonc
{
  "copilot-adapter-kit.providers": {
    "groq": {
      "baseUrl": "https://api.groq.com/openai/v1",
      "modelAlias": { "llama3-70b": "llama-3.1-70b-versatile" }
    }
  },
  "copilot-adapter-kit.models": [
    {
      "id": "llama3-70b",
      "name": "Llama 3.1 70B (Groq)",
      "family": "groq",
      "detail": "Groq LPU — blazing fast",
      "maxIn": 128000,
      "maxOut": 8192,
      "toolCalling": 128
    }
  ]
}
```

```
Cmd+Shift+P → "Copilot Adapter Kit: Set API Key" → pick "groq" → paste your Groq API key
```

---

### Multiple Providers at Once

All providers can coexist. Each model's `"family"` field determines which engine and API key are used:

```jsonc
{
  "copilot-adapter-kit.providers": {
    "openai":   { "baseUrl": "https://api.openai.com/v1" },
    "ollama":   { "baseUrl": "http://localhost:11434/v1" },
    "lmstudio": { "baseUrl": "http://localhost:1234/v1" },
    "groq":     { "baseUrl": "https://api.groq.com/openai/v1" },
    "deepseek": { "baseUrl": "https://api.deepseek.com/v1" }
  },
  "copilot-adapter-kit.models": [
    { "id": "gpt-5.5",       "name": "GPT-5.5",          "family": "openai" },
    { "id": "llama3-8b",     "name": "Llama 3.1 8B",     "family": "ollama" },
    { "id": "qwen-coder",    "name": "Qwen 2.5 Coder",   "family": "lmstudio" },
    { "id": "llama3-70b",    "name": "Llama 3.1 70B",    "family": "groq" },
    { "id": "deepseek-chat", "name": "DeepSeek V4",      "family": "deepseek" }
  ]
}
```

Each family gets its own API key. Run `Set API Key` once per provider.

---

## 🧩 Manage Models

The `copilot-adapter-kit.models` setting defines what appears in the Copilot Chat model picker.

| Field | Required | Description |
|---|---|---|
| `id` | ✅ | Unique picker ID. This is what you select in Copilot Chat. |
| `family` | ✅ | Which provider engine handles this model (`openai`, `ollama`, `groq`, etc.). |
| `name` | — | Display name in the picker. Defaults to `id`. |
| `version` | — | Model version string. Defaults to `"custom"`. |
| `detail` | — | Description shown below the model name. |
| `maxIn` | — | Max input tokens. Default `128000`. |
| `maxOut` | — | Max output tokens. Default `16384`. |
| `image` | — | Whether the model supports images (vision). Default `true`. |
| `thinking` | — | Whether the model emits reasoning/thinking tokens. Default `false`. |
| `toolCalling` | — | Max parallel tool calls. Default `128`. |
| `apiPath` | — | Per‑model API path override (e.g. `/responses`). Falls back to provider default. |

**Built‑in models** (always available):

| Picker ID | Provider | Features |
|---|---|---|
| `gpt-5.5` | openai | 1M in, 128k out, vision, thinking, 128 tools |
| `gpt-5.4` | openai | 1M in, 128k out, vision, thinking, 128 tools |
| `gpt-5.4-mini` | openai | 400k in, 128k out, vision, 128 tools |
| `gpt-5.4-nano` | openai | 400k in, 128k out, vision, 128 tools |
| `codex-5.3` | openai | 1M in, 128k out, vision, thinking, 128 tools |

Your `models` array is **merged** with the built‑ins. If you define a model with the same `id`, yours takes priority — useful for pinning a specific model version.

---

## 🧱 Architecture

```
┌──────────────────────────────────────────┐
│          Copilot Chat (VS Code)            │
└────────────────┬─────────────────────────┘
                 │ LanguageModelChatProvider
┌────────────────▼─────────────────────────┐
│  conduit/copilot-bridge.ts                 │
│  model → family → provider config + key   │
│  Tool stabilization (opt‑in)              │
└────────────────┬─────────────────────────┘
                 │ Engine SPI
┌────────────────▼─────────────────────────┐
│  mesh/pipeline.ts  (AOP Chain)             │
│  ┌───────────────┐ ┌──────────────┐       │
│  │RateLimitGuard │→│ ErrorWarden  │→      │
│  │ 429 retry×3   │ │ HTTP+net map │       │
│  └───────────────┘ └──────────────┘       │
│  ┌───────────────┐                        │
│  │  DiagTracer   │  fingerprint·dump      │
│  └───────────────┘                        │
└────────────────┬─────────────────────────┘
                 │
┌────────────────▼─────────────────────────┐
│  mesh/discovery.ts  (Provider Registry)    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ openai   │ │ ollama   │ │ lmstudio │  │
│  │ SSE      │ │ SSE      │ │ SSE      │  │
│  └──────────┘ └──────────┘ └──────────┘  │
└──────────────────────────────────────────┘
```

### Design Patterns

| Pattern | Implementation |
|---|---|
| **SPI (Service Provider Interface)** | `mesh/contract.ts` — `Engine` interface. Every backend implements it. |
| **IoC (Inversion of Control)** | `kernel/context.ts` — single bootstrapper wires all services. |
| **AOP (Aspect‑Oriented)** | `mesh/pipeline.ts` — interceptor chain wraps every engine call. |
| **Factory** | `mesh/discovery.ts` — register engines by family, lookup at runtime. |
| **Strategy** | Per‑family `ProviderConfig` with optional `modelAlias` translations. |

---

## ⚙️ Settings Reference

All settings are under the `copilot-adapter-kit` prefix.

### `copilot-adapter-kit.providers`

```jsonc
{
  "copilot-adapter-kit.providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",   // Required: API endpoint
      "modelAlias": {                            // Optional: picker-id → API model name
        "gpt-4o": "gpt-4o-2024-08-06"
      }
    }
  }
}
```

Each key under `providers` is a **family name**. It must match the `family` field in your model definitions and the engine registered in `ProviderDiscovery`.

- `baseUrl` — The API endpoint **without** `/chat/completions` (appended automatically).
- `modelAlias` — Maps picker model IDs to the actual model name sent to the API. Useful when your provider uses a different naming scheme.

### `copilot-adapter-kit.models`

Array of custom model definitions. Merged with built‑ins. See [Manage Models](#-manage-models) for the full schema.

### `copilot-adapter-kit.maxTokens`

```jsonc
{ "copilot-adapter-kit.maxTokens": 4096 }
```

Maximum output tokens sent to the provider. `0` (default) means no limit — the provider's default applies.

### `copilot-adapter-kit.logLevel`

```jsonc
{ "copilot-adapter-kit.logLevel": "quiet" }   // Default: no output channel
{ "copilot-adapter-kit.logLevel": "meta"  }   // Log request fingerprints & diffs
{ "copilot-adapter-kit.logLevel": "dump"  }   // meta + write request payloads to disk
```

View logs: `Cmd+Shift+P → "Copilot Adapter Kit: Show Logs"`.  
View dumps: `Cmd+Shift+P → "Copilot Adapter Kit: Open Dumps Folder"`.

### `copilot-adapter-kit.stabilizeTools`

```jsonc
{ "copilot-adapter-kit.stabilizeTools": true }
```

⚠️ **Experimental.** Pre‑activates VS Code tool activators to lock the tools array across conversation turns. Helps maintain cache prefix stability. If you see "tool list is unstable" warnings, enable this.

### `copilot-adapter-kit.showBuiltinModels`

```jsonc
{ "copilot-adapter-kit.showBuiltinModels": true }   // Default: show built-in models
{ "copilot-adapter-kit.showBuiltinModels": false }  // Hide built-ins, only show your models
```

Toggle whether the built‑in OpenAI model catalog (GPT-5.5, GPT-5.4, GPT-5.4-mini, GPT-5.4-nano, Codex 5.3) appears in the Copilot picker. Set to `false` to only show models from your `copilot-adapter-kit.models` list — keeps the picker clean when you only use local/third‑party providers.

---

## ⌨️ Commands Reference

| Command | ID | Description |
|---|---|---|
| **Open Panel** | `copilot-adapter-kit.openPanel` | 🎨 Beautiful form UI — all settings in one place |
| **Configure** | `copilot-adapter-kit.configure` | QuickPick wizard — max tokens, log level, etc. |
| **Add Provider** | `copilot-adapter-kit.addProvider` | Step‑by‑step form to add a new provider |
| **Remove Provider** | `copilot-adapter-kit.removeProvider` | Pick a provider to remove |
| **Add Model** | `copilot-adapter-kit.addModel` | 8‑step form to add a custom model |
| **Remove Model** | `copilot-adapter-kit.removeModel` | Pick a custom model to remove |
| **Set API Key** | `copilot-adapter-kit.setApiKey` | Store per‑provider API key in OS keychain |
| **Clear API Key** | `copilot-adapter-kit.clearApiKey` | Remove a provider's API key |
| **Open Settings** | `copilot-adapter-kit.openSettings` | Jump to raw JSON settings editor |
| **Show Logs** | `copilot-adapter-kit.showLogs` | Open the "Copilot Adapter Kit" output channel |
| **Open Dumps Folder** | `copilot-adapter-kit.openDumps` | Reveal the request dump directory in Finder |

Click **$(plug) CAK** in the status bar to open the panel. All commands also available under `Copilot Adapter Kit:` in the Command Palette (`Cmd+Shift+P`).

---

## 🛡️ Interceptors

Every request passes through a chain of interceptors — middleware that can inspect, modify, or short‑circuit the stream. Think of it as Express‑style middleware for LLM calls.

### RateLimitGuard — 429 Auto‑Retry

- Catches HTTP 429 responses from the provider
- Parses `"try again in Xs"` from the response body
- Shows a thinking block with wait time: *"Rate limited. Retrying in 10s... (1/3)"*
- Retries up to **3 times** with the full request
- If the `Retry-After` header or body is missing, defaults to 10s

### ErrorWarden — Friendly Error Messages

Maps raw error codes to actionable user messages:

| Error | Message |
|---|---|
| 401 | "Invalid API key. Run Set API Key." |
| 402 | "Insufficient balance. Top up your account." |
| 500/502/503 | "Provider server error. Retry shortly." |
| `ENOTFOUND` | "DNS lookup failed. Check network/firewall." |
| `ECONNREFUSED` | "Connection refused. Verify baseUrl and service status." |
| `ETIMEDOUT` | "Connection timed out. Service may be overloaded." |
| `CERT_HAS_EXPIRED` | "TLS verification failed. Check certificate." |
| `ECONNRESET` | "Connection interrupted. Check network stability." |

All errors include a collapsible `<details>` block with raw response text for debugging.

### DiagTracer — Request Diagnostics

At `logLevel: meta`:
- Logs each request: model, message count, tool count
- Computes a **fingerprint** (message structure hash) and diffs against the previous request
- Detects shifts in system prompt windows, user messages, and tool configuration
- Calibrates token estimation from real usage data

At `logLevel: dump`:
- Writes the full request payload (JSON) to `$TMPDIR/copilot-adapter-kit-dumps/`
- Writes the system prompt separately as `.sys.txt` for easy inspection

---

## 👨‍💻 Developer Guide

```bash
nvm use 22             # Requires Node ≥22
npm install            # Install dependencies
npm run watch          # Compile in watch mode
```

### Project Structure

```
copilot-adapter-kit/
├── src/
│   ├── entry.ts                   # VS Code activate/deactivate
│   ├── kernel/                    # IoC container & configuration
│   │   ├── context.ts             # ApplicationContext — boots all services
│   │   ├── vault.ts               # Per-family key storage (OS keychain)
│   │   └── tuning.ts              # Settings facade
│   ├── mesh/                      # Engine SPI & pipeline
│   │   ├── contract.ts            # Engine, Payload, StreamEvents interfaces
│   │   ├── discovery.ts           # Provider registry (register engines here)
│   │   ├── pipeline.ts            # AOP interceptor chain
│   │   └── engines/
│   │       └── openai/
│   │           ├── openai-engine.ts   # OpenAI SSE stream implementation
│   │           └── wire-format.ts     # VS Code messages → OpenAI JSON
│   ├── conduit/                   # VS Code API integration
│   │   ├── copilot-bridge.ts      # LanguageModelChatProvider impl
│   │   └── model-catalog.ts       # Model registry + user model loader
│   ├── crosscut/                  # Interceptors (cross-cutting concerns)
│   │   ├── rate-limit-guard.ts    # 429 retry with thinking block
│   │   ├── error-warden.ts        # HTTP + network error → friendly text
│   │   ├── diag-tracer.ts         # Request logging, fingerprinting, dumps
│   │   ├── insight-engine.ts      # Request fingerprint hashing & diff
│   │   └── tool-stabilizer.ts     # Tool pre-activation stabilizer
│   └── tooling/                   # Utility classes
│       └── token-math.ts          # Approximate token counting
├── package.json
├── tsconfig.json
└── README.md
```

### Adding a New Engine

The `Engine` SPI is the only contract you need to implement. Here's how to add a new provider (e.g., Anthropic):

**1. Implement the `Engine` interface**

```typescript
// src/mesh/engines/anthropic/anthropic-engine.ts
import { Engine, Payload, StreamEvents } from '../../contract';

export class AnthropicEngine implements Engine {
  readonly family = 'anthropic';
  private baseUrl = '';
  private apiKey = '';

  configure(endpoint: string, key: string): void {
    this.baseUrl = endpoint;
    this.apiKey = key;
  }

  async stream(req: Payload, sink: StreamEvents, signal?: AbortSignal): Promise<void> {
    // Translate Payload → Anthropic Messages API format
    // Call fetch(), handle streaming, emit onToken/onToolSignal/onComplete
    // On error: sink.onFault(error)
  }
}
```

**2. Register the engine**

```typescript
// src/mesh/discovery.ts
import { AnthropicEngine } from './engines/anthropic/anthropic-engine';

export class ProviderDiscovery {
  constructor() {
    this.register(new OpenAIEngine());
    this.register(new AnthropicEngine());   // ← Add here
  }
}
```

**3. Add built‑in models (optional)**

```typescript
// src/conduit/model-catalog.ts
export const BUILTIN_CATALOG: ModelMeta[] = [
  // ...existing...
  { id: 'claude-opus', name: 'Claude Opus 4', family: 'anthropic',
    version: 'claude-opus-4', detail: 'Most capable Anthropic model',
    maxIn: 200000, maxOut: 16384, image: true, thinking: true, toolCalling: 128 },
];
```

**4. Users configure it**

```jsonc
{
  "copilot-adapter-kit.providers": {
    "anthropic": { "baseUrl": "https://api.anthropic.com" }
  }
}
```

That's it. The pipeline, interceptors, key management, and model picker all work automatically for the new family.

### Adding a New Interceptor

Implement the `Interceptor` interface and register it in `Context.bootstrap()`:

```typescript
// src/crosscut/my-interceptor.ts
import type { Interceptor } from '../mesh/pipeline';

export class MyInterceptor implements Interceptor {
  async intercept(payload, engine, sink, signal, next) {
    // BEFORE: inspect/modify payload or sink
    console.log('request:', payload.model);

    await next();  // Call the next interceptor (or the engine)

    // AFTER: the stream has completed
  }
}
```

```typescript
// src/kernel/context.ts
import { MyInterceptor } from '../crosscut/my-interceptor';

static async bootstrap(ext: vscode.ExtensionContext): Promise<Context> {
  // ...
  ctx.pipeline.use(ctx.rateLimitGuard);
  ctx.pipeline.use(ctx.errorWarden);
  ctx.pipeline.use(new MyInterceptor());   // ← Add here
  ctx.pipeline.use(ctx.tracer);
  // ...
}
```

Interceptors run in registration order. `RateLimitGuard` and `ErrorWarden` wrap `sink.onFault` to intercept errors — `DiagTracer` wraps lifecycle events for observability.

### Key Design Decisions

- **No shared API key.** Each family gets its own key in the OS keychain (`copilot-adapter-kit.apiKey.{family}`). There is no fallback key.
- **No engine discovery from config.** Engines are compile‑time registered in `ProviderDiscovery`. The config only provides endpoint + key. This keeps the SPI surface small and prevents arbitrary code execution.
- **Error reporting is inline, not thrown.** The bridge reports errors as `LanguageModelTextPart` so the user sees a formatted message in chat rather than a red error banner.
- **Thinking blocks use `LanguageModelThinkingPart`** (proposed API) with ID `'cak-thinking'` for the glow animation in VS Code Insiders.
- **All interceptors use async chains fully awaited.** This is critical for 429 retry — missing an `await` means the guard fires after the response is already returned.

---

## 🔧 Troubleshooting

<details>
<summary><strong>"No API key configured" warning</strong></summary>

Run `Cmd+Shift+P → "Copilot Adapter Kit: Set API Key"`, pick the provider, and paste your key. Keys are stored per‑family — make sure you set the key for the correct provider.
</details>

<details>
<summary><strong>"No baseUrl configured for provider" error</strong></summary>

Add the provider to `copilot-adapter-kit.providers` in your `settings.json`:

```jsonc
{
  "copilot-adapter-kit.providers": {
    "ollama": { "baseUrl": "http://localhost:11434/v1" }
  }
}
```
</details>

<details>
<summary><strong>Ollama connection refused</strong></summary>

Make sure Ollama is running:
```bash
curl http://localhost:11434/v1/models
```

If not, start it: `ollama serve`
</details>

<details>
<summary><strong>LM Studio connection refused</strong></summary>

Make sure the LM Studio local server is started:
1. Open LM Studio → Developer tab (or Local Server)
2. Load your model
3. Click "Start Server"
4. Verify: `curl http://localhost:1234/v1/models`
</details>

<details>
<summary><strong>429 Rate Limit errors</strong></summary>

CAK auto‑retries up to 3 times. If you still see 429s:
- Reduce request rate (fewer parallel chats)
- Upgrade your provider tier
- For local models, 429 shouldn't happen — check your proxy configuration
</details>

<details>
<summary><strong>Model not showing in picker</strong></summary>

1. Make sure the model's `family` matches a key in `copilot-adapter-kit.providers`
2. Make sure you've set an API key for that family
3. Run `Cmd+Shift+P → "Developer: Reload Window"` to refresh the picker
</details>

---

## 🤝 Contributing

Issues and PRs are welcome. Before adding a new engine, please read the [Adding a New Engine](#adding-a-new-engine) section. The SPI is intentionally small — keep engine implementations self‑contained in `src/mesh/engines/{family}/`.

---

## License

MIT © [salilvnair](https://github.com/salilvnair)

---

## 📦 Publishing

```bash
npm run compile          # Build TypeScript → out/
npm run logo             # Generate icon font from resources/cak-icon-src.svg
npm run package          # Create .vsix file
```

### Quick publish

```bash
npm run publish          # Publish to marketplace
npm run publish:patch    # Auto‑bump patch version + publish
npm run publish:minor    # Auto‑bump minor version + publish
```

### Manual upload

1. Go to [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
2. Click **New Extension** → upload the `.vsix`

### Prerequisites

- Node ≥22 (use `nvm use 22`)
- `"publisher": "salilvnair"` matches marketplace publisher ID
- `resources/icon.png` — extension icon (also used in panel header)
- `resources/cak-icons.woff` — custom icon font for status bar `$(cak-icon)`
- `.vscodeignore` excludes `src/`, `node_modules/`, etc.

| Provider | Family | `baseUrl` |
|---|---|---|
| **OpenAI** | `openai` | `https://api.openai.com/v1` |
| **Azure OpenAI** | `openai` | `https://{res}.openai.azure.com/openai/deployments/{dep}` |
| **Ollama** | `ollama` | `http://localhost:11434/v1` |
| **LM Studio** | `lmstudio` | `http://localhost:1234/v1` |
| **vLLM** | `openai` | `http://localhost:8000/v1` |
| **Groq** | `openai` | `https://api.groq.com/openai/v1` |
| **Together AI** | `openai` | `https://api.together.xyz/v1` |
| **LiteLLM Proxy** | `openai` | `http://localhost:4000/v1` |

Providers with non‑OpenAI APIs (Anthropic, Google) need a custom engine — see the Anthropic example above.

---

## 📄 License

MIT · Copyright © 2026 [salilvnair](https://github.com/salilvnair)
