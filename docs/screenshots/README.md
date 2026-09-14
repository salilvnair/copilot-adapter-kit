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
| ![Standalone](25-spend-guard-standalone-panel.png) | The same dashboard as its own panel, which replaced the native modal |

## Workspace

| | |
|---|---|
| ![Configuration](10-configuration-general.png) | **General** — each setting with the sentence that says what it costs |
| ![Prompts](11-configuration-prompts.png) | **Prompts** — templates priced by what they add to every turn |
| ![Vision](12-configuration-vision.png) | **Vision** — the route drawn, including the extra call per image per turn |
| ![Git Tools](13-git-tools.png) | **Git Tools** — prompt, diff mode and threshold |
| ![JSON](14-json-settings.png) | **JSON Settings** — the same values, written out; keys never appear |
| ![Dumps](15-request-dumps.png) | **Request Dumps** — what was sent, and what was refused |
| ![Audit Log](16-devtools-audit-log.png) | **Developer Tools · Audit Log** — one row per model call and per panel action, colour-coded by module, the same table daakia has |
| ![Record](17-devtools-audit-log-expanded.png) | A row expanded into the whole record. Bodies are absent unless `audit.recordBodies` is on, and it says so |
| ![Audit Config](18-devtools-audit-config.png) | **Audit Config** — every event that can be recorded, by module, with the switches that decide which ones are |
| ![DB Explorer](19-devtools-db-explorer.png) | **DB Explorer** — the SQLite store underneath both, browsable a table at a time |
| ![Bin](20-bin.png) | **Bin** — soft deletes, and the note that a key outlives its provider |
| ![Danger Zone](21-danger-zone.png) | **Danger Zone** — four holds, each naming the live count it destroys |
| ![Palette](22-command-palette.png) | **Ctrl K** — providers, models, settings and actions in one search |

## Sidebar

| | |
|---|---|
| ![Git AI](23-sidebar-git-ai.png) | **Git AI** at the 340 px it actually gets — branch, counts and per-file stats, all of which the old panel computed and discarded |
| ![All files](24-sidebar-all-files.png) | Scope switched from staged to everything |

## Both themes

| | |
|---|---|
| ![Providers light](26-providers-light-theme.png) | The panels follow the editor's theme, or an explicit choice from the toggle in the top bar |
| ![Spend Guard light](27-spend-guard-light-theme.png) | |
