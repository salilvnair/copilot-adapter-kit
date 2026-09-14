# Demo video generator

Generates the showcase video (and a GIF) by driving the **real panel** with
Playwright — real clicks, real typing, the real UI — then composing the clips
with gimbal-style camera moves and crossfades via ffmpeg.

Nothing here ships in the extension. It is a dev-only content tool, the same
category as `scripts/screenshots.mjs`, and `.output/` is gitignored.

Everything runs against the Vite dev server, so the figures come from
`webview-ui/src/app/fixture.ts` and every frame carries the amber sample-data
bar that says so. No key, no provider and no request in the video is real.

## Requirements

- **ffmpeg** on `PATH` — `winget install Gyan.FFmpeg`, or `brew install ffmpeg`
- Playwright's Chromium, which `npm --prefix webview-ui install` already pulls

The dev server is started for you if one is not already listening on 5173.

## Usage

```bash
npm run showcase
```

Records every segment, composes `.output/copilot-adapter-kit-showcase.mp4` and
`.output/copilot-adapter-kit-showcase.gif`. That is the whole loop — change a
recipe or an effect, run it again, look at the result.

Or run the steps on their own:

```bash
npm run demo-video:record                      # raw clips -> .output/raw/
npm run demo-video:compose                     # -> .output/<name>.mp4
npm run demo-video:compose -- --gif            # and the .gif
npm run demo-video:record -- --only providers  # reshoot one segment
```

`--only` leaves the other clips alone, which is the point of it: a full record
wipes `raw/`, a partial one does not.

Other flags for `record.js`: `--url` (a dev server on another port),
`--keep-going` (record the rest after a failure instead of stopping),
`--retries N` (attempts per segment, default 2).

## A bad take never reaches the video

Every recipe verifies what it did before its clip is kept. A segment that typed
into a drawer which never opened produces a perfectly plausible clip of the
wrong screen, and the composer cannot tell. So:

- a failed segment's video is **deleted**,
- a screenshot of the moment it broke lands in `.output/failed/<id>.png`,
- the run exits non-zero naming what failed,
- and `compose.js` refuses to stitch a video with a clip missing.

`record.js` writes `.output/config.snapshot.json` listing only the segments that
verified, and `compose.js` prefers it — so an `--only` run composes what it has
rather than failing on the fifteen clips it was never asked to make.

## Configuring it — `config.json`

The only file most changes need to touch.

- **`segments`** — the ordered clips. Each has a `recipe` (a function in
  `recipes.js`), an `effect` (below), and `trimStartSec` as a fallback for a
  recipe that never marked its window.
- **`intro`** — the typed brand card. `holdSec` is how long the finished card
  stays up after the animation ends.
- **`transitions`** — crossfade `type` (any
  [ffmpeg xfade name](https://ffmpeg.org/ffmpeg-filters.html#xfade): `fade`,
  `circleopen`, `zoomin`, `wipeleft`…) and `durationSec`.
- **`output`** — resolution, fps, filename.

### Camera effects

Every effect is the same shot: the crop window eases toward a focal point while
zooming, on a smoothstep curve (zero velocity at both ends — a drift, not a
constant-speed robot pan), rendered at 2× the output resolution and scaled back
down. That last part is the fix for the shimmer `zoompan` otherwise shows on
crisp UI edges and text; `effects.js` explains why at length.

| Preset | Feels like |
|---|---|
| `static` | Locked off |
| `zoom-in` / `zoom-out` | Push in / pull out, centred |
| `pan-left-right` / `pan-right-left` | Drifts sideways while pushing in |
| `tilt-top-down` / `tilt-bottom-up` | Drifts vertically while pushing in |
| `zoom-in-top-left`, `-top-right`, `-bottom-left`, `-bottom-right` | Pushes toward a corner — for racking onto one panel |

For anything a preset does not cover, pass an object and override it:

```json
"effect": { "preset": "zoom-in", "fx": 0.3, "fy": 0.7, "zoomTo": 1.4, "direction": "in" }
```

`fx`/`fy` are the focal point as a fraction of the frame (`0,0` top-left,
`1,1` bottom-right). `direction: "out"` reverses the shot. Presets sit at
1.06–1.10× on purpose: real product-demo Ken Burns is gentle enough that you
feel the shot is alive without noticing the camera.

### Recipes (`recipes.js`)

One per screen. Each is `async (page, opts, mark) => {}` — call `mark.begin()`
when the interesting part starts and `mark.end()` when it is over. Playwright
films from the moment the page is created, so without those marks every clip
opens on a blank frame and the app booting, and the video runs three times its
useful length. `record.js` turns the marks into the trim, with a 0.6s lead-in
and a 1.4s hold.

| Recipe | Shows |
|---|---|
| `spendGuardToday` | The burn curve against the ceiling |
| `limits` | A daily limit typed, not stepped |
| `spendGuardHistory` | Fourteen weeks, red where the cap was reached |
| `providers` | Every provider state at once, and the filter |
| `addProvider` | The family filling the endpoint |
| `models` | What the Copilot picker will show |
| `apiKeys` | Existence, health and age — never the key |
| `auditLog` | One row per model call and per panel action |
| `auditRecord` | A row opened into the whole record |
| `auditConfig` | The switches that decide what is written down |
| `dbExplorer` | The SQLite store underneath |
| `configuration` | Each setting with what it costs |
| `gitTools` | Commit messages, priced before sending |
| `sidebar` | Git AI at the 340px it actually gets |
| `dangerZone` | Nothing destructive on one click |
| `commandPalette` | Ctrl K across everything |

### Adding a segment

1. Add a function to `recipes.js` — plain Playwright. Mark the window, and end
   with a `must(...)` that fails if the screen is not what you meant to film.
2. Add an entry to `config.json`'s `segments` with the recipe name and an
   effect.
3. `npm run demo-video:record -- --only <id>` then `npm run demo-video:compose`.

### Gotchas

- **Nothing carries over between segments.** Each take gets a fresh browser and
  a fresh context, deliberately — twenty video recordings in one process
  exhausts the renderer and it crashes at a different segment each time.
- **The Developer Tools editor is lazy.** The audit record's metadata block
  mounts Monaco on demand; wait for `.monaco-editor` rather than a timeout.
- **`getByLabel` can match twice.** A stepper's group and its input both carry a
  name — the input's is `"<label> value"`.
- **Badges are uppercased in CSS**, so the DOM keeps the source casing. Match
  `'Providers'`, not `'PROVIDERS'`.
