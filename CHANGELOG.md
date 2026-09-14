# Changelog

All notable changes to **Copilot Adapter Kit**.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] — 2026-09-14

### Added
- **A showcase video.** `npm run showcase` drives the real panel with Playwright
  — real clicks, real typing — and composes the clips with gimbal-style camera
  moves and crossfades via ffmpeg. Seventeen segments covering every screen, into
  `docs/demo/`. Each recipe verifies what it did before its clip is kept, so a
  take of the wrong screen cannot reach the finished video.
- **`npm run rank`** — where this extension lands in Marketplace search, and who
  is above it, read from the public gallery API. Run it before a metadata change
  and after the Marketplace reindexes.
- A rewritten **README** built around the demo, and this **CHANGELOG**.

### Changed
- **Marketplace metadata, for search.** The listing had no keywords at all and
  described itself as a "plugin-based provider mesh" — a phrase nobody types
  into a search box. It now says what it is in the words people use, carries 46
  keywords, and sits in five categories rather than two. Measured baseline
  before the change: ranked for **0 of 33** terms.

---

## [2.0.6] — 2026-09-14

### Changed
- **Reachability answers are cached.** Opening the panel used to probe every
  configured provider again. An answer is now reused while it is fresh.
  `copilot-adapter-kit.health.probeIntervalMinutes` sets the window — default
  `5`, `0` checks on every open — and it is editable in
  **Configuration → Connections**. Pressing **Test** always asks, whatever the
  setting says.

### Fixed
- The Providers screen claimed reachability was checked *"when the panel opens,
  then hourly"*. There was no hourly anything — no timer existed. The caption is
  now generated from the real interval, so it cannot drift from the behaviour
  again.

### Added
- `test/health.test.js` asserts the probe at the `fetch`: the URL, the method,
  and — the part the promise rests on — that it sends **no headers, no body and
  nothing in the query string**. Your key is never attached to a probe.

---

## [2.0.5] — 2026-09-14

### Added
- **Token sizes that match what providers publish.** Max output stopped at 128K;
  DeepSeek's `max_tokens` ceiling is 393,216. Both ladders now run
  `4K 8K 16K 32K 64K 128K 200K 256K 400K 1M 2M` for context and
  `4K 8K 16K 32K 64K 100K 128K 200K 300K 393K` for output.
- **A Custom size** on both the panel and the palette, because no ladder covers
  every model.
- **Every limit is typeable.** Daily tokens, daily cost, input, output and turns
  are inputs now, not read-only text with − and +. Focus shows the raw number,
  blur or Enter commits, Escape abandons, and `2M`, `393k` and `$12.50` all
  parse.

### Fixed
- **Nothing is truncated.** Audit bodies were clipped at 8,000 characters —
  shorter than most system prompts — then clipped again at 6,000 in the panel
  and 50,000 in the DB Explorer's viewer. All three are gone.
- **A long screen scrolls.** `#root` was `min-height:100%`, so a long list grew
  the page while the stage clipped it — content ran past the window with no
  scrollbar. The app is bounded to the viewport; the inner regions scroll.
- Payload blocks wrap by default, with a toggle, and show their character count.

---

## [2.0.4] — 2026-09-14

### Fixed
- **Saving a provider from the panel never worked.** The panel sent
  `providerConfig`; the host read `config`, got `undefined`, and threw
  `Cannot read properties of undefined (reading 'family')` on every save.
  Nothing was ever written — which is why a fresh install had no `providers`
  key at all.
- **Changing the family left the old endpoint behind.** The drawer filled the
  URL only when the field was empty, so DeepSeek pointed at `api.openai.com`.
  A URL that is still some family's default is replaced; one you typed is not.
- **A key typed while adding a provider was discarded** — it was stored only
  when a uuid already existed, and a provider being added has none yet.
- **The sidebar's Regenerate threw away your guidance and scope.** It posted
  `{ regenerate: true }` and nothing else, while the host reads `message` and
  `scope`.

### Added
- `message-contract` now compares **payload keys**, not just message names. A
  handler that agrees on the name and disagrees on the shape used to be
  invisible to the whole suite; it found the Regenerate bug immediately.

---

## [2.0.3] — 2026-09-14

### Added
- **Developer Tools**, with three tabs:
  - **Audit Log** — one row per model call and per panel action, colour-coded by
    module, each expanding into the whole record.
  - **Audit Config** — every event that can be recorded, grouped by module, with
    per-event and per-group switches, and a live count.
  - **DB Explorer** — the SQLite store underneath both, browsable a table at a
    time, with a JSON viewer for long values.
- `listTables`, `getTableRows` and `deleteTableRow` in the storage layer. Table
  names are checked against `sqlite_master` and identifiers are quoted; there is
  deliberately no query box.

### Changed
- The separate Audit Log screen and the old Dev Tools screen are gone, folded
  into the tabs above.
- Monaco (via dui's `EditorView`) renders the record bodies. It loads when an
  editor is first shown, so no other screen pays for it.

---

## [2.0.2] — 2026-09-14

### Fixed
- **The palette commands wrote data nothing else could read.** `Add Provider`
  wrote a provider with no `family` field, keyed by the family name — and every
  lookup in the extension resolves providers *by* family, so one added that way
  could never be found. `Add Model` wrote a flat array while the catalogue reads
  a map keyed by provider UUID, so palette-added models were invisible in the
  picker with nothing said about why.
- `Remove Provider` listed providers by raw UUID and fell over on a malformed
  entry.

### Added
- Every command is registered through a wrapper that logs the stack and shows a
  message **naming the command**, with a **Show log** action. A bare
  `Cannot read properties of undefined` names nothing and cannot be reported.

### Changed
- Removed the remaining emoji from host-side messages; QuickPick labels take
  codicons and notifications draw their own icon.

---

## [2.0.1] — 2026-09-13

### Fixed
- **`SQLite did not start` — `Cannot find module 'sql.js'`.** `.vscodeignore`
  excludes `node_modules`, so every runtime dependency was left out of the
  `.vsix`. The extension host is now bundled with esbuild, so nothing is looked
  up at runtime; only the WASM binary travels beside it.
- **The History tab was black.** A day filed into `globalState` by an older
  build comes back missing fields that did not exist then; `.toFixed` on an
  absent `costUsd` threw during render and unmounted the panel.

### Added
- `test/packaging.test.js` reads the **built bundle**: no bare module require
  may survive bundling, the WASM must be present and valid, and the ignore list
  must keep `dist` and `media` while dropping `src`, `out` and `node_modules`.
- `vscode:prepublish`, which was missing — `vsce package` could ship whatever
  happened to be sitting in `out/`.

---

## [2.0.0] — 2026-09-13

The release this whole line exists for. An overnight run on a configured
provider burned roughly 100M tokens; nothing in the extension counted them,
capped them, or could say afterwards where they went.

### Added
- **Spend Guard.** A daily token and cost ledger, hourly buckets, fourteen weeks
  of history, and limits applied **before a request is sent** rather than after
  the bill arrives:
  - daily tokens and daily cost,
  - input per request, so one oversized prompt cannot take the whole budget,
  - output per request — **output is never unbounded**,
  - turns per conversation, which is the cap that actually stops an agent loop.
  Refusals never reach the network, and each one is recorded with its reason.
- **A status bar item** shaped like Copilot's: the mark alone until there is
  something to say, then a percentage, then red when it is blocking. The hover
  draws the day as a sparkline — the shape says whether spend crept up all day
  or arrived in one burst at 3am, which a percentage cannot.
- **A status menu** on click, with the figures, the guard state and the way in
  to everything else.
- **An audit log on SQLite** (sql.js — no native compilation), recording one row
  per model call and per panel action. Keys and request headers are never
  recorded; prompt and response bodies are **off by default**, because that
  payload is your source code.
- **A rebuilt panel** on `@salilvnair/dui`: Providers, Models, API Keys, Spend
  Guard, Configuration, Git Tools, JSON Settings, Request Dumps, Bin and Danger
  Zone, plus a Ctrl+K command palette and a light/dark theme that follows the
  editor or takes an explicit choice.
- **A Git AI sidebar** that shows the branch, the counts, per-file stats and the
  cost of the request **before** it is sent.
- A browser test suite driving every screen, and a screenshot script that
  regenerates `docs/screenshots/`.

### Changed
- Every provider call now runs through an interceptor chain with the guard
  first: **BudgetWarden → AuditRecorder → RateLimitGuard → ErrorWarden →
  DiagTracer → Engine**.
- API keys live in VS Code SecretStorage, never in `settings.json`, and are
  never shown back to the panel. Reachability is probed **without the key
  attached**; key validity is inferred only from real responses.

### Fixed
- Hold-to-confirm stalled in a hidden webview (rAF delivers no frames there).
- Several panel controls posted messages nothing handled — they rendered
  perfectly and did nothing. A contract test now fails on that.

---

## [1.0.3] and earlier

Provider mesh for Copilot Chat: OpenAI-compatible engines, the Anthropic
Messages API, tool calling, streaming, vision fallback, thinking blocks,
rate-limit retry and request dumps. No spend accounting — see 2.0.0.

[2.0.6]: https://github.com/salilvnair/copilot-adapter-kit/releases/tag/v2.0.6
[2.0.5]: https://github.com/salilvnair/copilot-adapter-kit/releases/tag/v2.0.5
[2.0.4]: https://github.com/salilvnair/copilot-adapter-kit/releases/tag/v2.0.4
[2.0.3]: https://github.com/salilvnair/copilot-adapter-kit/releases/tag/v2.0.3
[2.0.2]: https://github.com/salilvnair/copilot-adapter-kit/releases/tag/v2.0.2
[2.0.1]: https://github.com/salilvnair/copilot-adapter-kit/releases/tag/v2.0.1
[2.0.0]: https://github.com/salilvnair/copilot-adapter-kit/releases/tag/v2.0.0
