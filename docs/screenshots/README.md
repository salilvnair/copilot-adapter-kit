# Screens

Regenerate with `node scripts/screenshots.mjs`. Captured against the Vite dev
server, so the figures come from `webview-ui/src/app/fixture.ts` — the amber bar
at the top of each shot says so. Nothing here is anyone's real usage.

## Connections

| | |
|---|---|
| ![Providers](01-providers.png) | **Providers** — all four card states at once: live, no key, key rejected, not running |
| ![Add provider](02-providers-add-drawer.png) | **Add provider** — opens at 330 px in a split you can drag, Test before Save |
| ![Overflow menu](03-providers-overflow-menu.png) | **Overflow** — destructive entry last, behind a separator, in red |
| ![Confirm](04-providers-confirm-remove.png) | **Confirm** — a removal says what goes with it before it happens |
| ![Models](05-models.png) | **Models** — grouped by provider; the switch is what the Copilot picker reads |
| ![Model editor](06-models-editor-drawer.png) | **Model editor** — one form with a live preview of the picker row |
| ![API keys](07-api-keys.png) | **API Keys** — existence, health and age; the key itself never comes back to the page |

## Guard

| | |
|---|---|
| ![Spend Guard](08-spend-guard-today.png) | **Today** — the cumulative curve against the ceiling, which is what makes a runaway legible while it is still running |
| ![History](09-spend-guard-history.png) | **History** — fourteen weeks, a column per week, red where the cap was reached |
| ![Standalone](22-spend-guard-standalone-panel.png) | The same dashboard as its own panel, which replaced the native modal |

## Workspace

| | |
|---|---|
| ![Configuration](10-configuration-general.png) | **General** — each setting with the sentence that says what it costs |
| ![Prompts](11-configuration-prompts.png) | **Prompts** — templates priced by what they add to every turn |
| ![Vision](12-configuration-vision.png) | **Vision** — the route drawn, including the extra call per image per turn |
| ![Git Tools](13-git-tools.png) | **Git Tools** — prompt, diff mode and threshold |
| ![JSON](14-json-settings.png) | **JSON Settings** — the same values, written out; keys never appear |
| ![Dumps](15-request-dumps.png) | **Request Dumps** — what was sent, and what was refused |
| ![Dev Tools](16-dev-tools.png) | **Dev Tools** — the interceptor chain, guard first |
| ![Bin](17-bin.png) | **Bin** — soft deletes, and the note that a key outlives its provider |
| ![Danger Zone](18-danger-zone.png) | **Danger Zone** — four holds, each naming the live count it destroys |
| ![Palette](19-command-palette.png) | **Ctrl K** — providers, models, settings and actions in one search |

## Sidebar

| | |
|---|---|
| ![Git AI](20-sidebar-git-ai.png) | **Git AI** at the 340 px it actually gets — branch, counts and per-file stats, all of which the old panel computed and discarded |
| ![All files](21-sidebar-all-files.png) | Scope switched from staged to everything |

## Both themes

| | |
|---|---|
| ![Providers light](23-providers-light-theme.png) | The panels follow the editor's theme rather than choosing their own |
| ![Spend Guard light](24-spend-guard-light-theme.png) | |
