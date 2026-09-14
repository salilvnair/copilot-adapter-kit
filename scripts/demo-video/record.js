#!/usr/bin/env node
/**
 * Records one clip per segment, driving the real panel.
 *
 * Every recipe verifies what it did before its clip is kept: a take that typed
 * into a panel which never opened still produces a plausible-looking clip of
 * the wrong thing, and the composer has no way to tell. A failed segment's
 * video is deleted, a screenshot of the moment it broke is written to
 * .output/failed/, and the run exits non-zero naming what went wrong.
 *
 * The dev server is started automatically unless one is already listening.
 *
 * Flags:
 *   --url URL     the app to record (default: config.json's appUrl)
 *   --only a,b    record just these segment ids
 *   --keep-going  record the rest after a failure instead of stopping
 *   --retries N   attempts per segment before giving up (default 2)
 *
 * Usage: node scripts/demo-video/record.js [path/to/config.json]
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('../../webview-ui/node_modules/playwright-core');
const { recipes } = require('./recipes');
const { buildIntroHtml, introAnimationSec } = require('./intro-template');

const ROOT = __dirname;
const REPO = path.join(ROOT, '..', '..');
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? (argv[at + 1] ?? true) : fallback;
};
const only = String(flag('--only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const keepGoing = argv.includes('--keep-going');
const retries = Number(flag('--retries', 2));

const configPath = path.resolve(argv.find(a => a.endsWith('.json')) || path.join(ROOT, 'config.json'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const urlOverride = flag('--url', '');
if (urlOverride && urlOverride !== true) config.appUrl = String(urlOverride);

const OUT_DIR = path.join(ROOT, '.output');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const SHOT_DIR = path.join(OUT_DIR, 'failed');

/*
  A full run starts from nothing; `--only` reshoots one segment and leaves the
  rest of the take alone. Wiping unconditionally made fixing one bad segment
  destroy the twenty clips beside it.
*/
if (!only.length) fs.rmSync(RAW_DIR, { recursive: true, force: true });
fs.rmSync(SHOT_DIR, { recursive: true, force: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

/** What the previous run verified, so an `--only` reshoot can keep it. */
function previousSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'config.snapshot.json'), 'utf8'));
  } catch { return null; }
}

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok || res.status < 500;
  } catch { return false; }
}

/** Start the Vite dev server, or reuse one that is already up. */
async function startServer(url) {
  if (await reachable(url)) {
    console.log('reusing the dev server already on ' + new URL(url).port);
    return { kill() {} };
  }
  const proc = spawn('npm', ['--prefix', 'webview-ui', 'run', 'dev'], {
    cwd: REPO, stdio: 'ignore', shell: process.platform === 'win32',
  });
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await reachable(url)) { console.log('dev server up\n'); return proc; }
  }
  proc.kill();
  throw new Error('dev server did not start within 60s');
}

/**
 * Chromium, one per take.
 *
 * Twenty video recordings in one process exhausts the renderer eventually, and
 * it crashes at a different segment each time — the tell that it is resource
 * pressure rather than a bad step. A launch costs a fraction of a second.
 */
function launch() {
  return chromium.launch({ args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
}

const LEAD_IN_SEC = 0.6;
const HOLD_SEC = 1.4;

/** Turn the marked window into the trim the composer wants. */
function trimFromMarks(marks, fallbackStart) {
  if (typeof marks.begin !== 'number') return { trimStartSec: fallbackStart };
  const trimStartSec = Math.max(0, marks.begin - LEAD_IN_SEC);
  if (typeof marks.end !== 'number') return { trimStartSec };
  return { trimStartSec, endAtSec: marks.end + HOLD_SEC };
}

async function take(browser, id, drive) {
  const dir = path.join(RAW_DIR, `${id}_tmp`);
  fs.mkdirSync(dir, { recursive: true });
  const { width, height } = config.output;
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir, size: { width, height } },
    colorScheme: 'dark',
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  const t0 = Date.now();
  const marks = {};
  const mark = {
    begin: () => { marks.begin = (Date.now() - t0) / 1000; },
    end: () => { marks.end = (Date.now() - t0) / 1000; },
  };

  let failure;
  try {
    await drive(page, mark);
  } catch (e) {
    failure = e;
    // A picture of the moment it went wrong, worth more than "element not found".
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${id}.png`) }).catch(() => {});
  }

  await page.waitForTimeout(400);
  await context.close();          // Playwright writes the video here.

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.webm'));
  if (failure || !files.length) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw failure || new Error('Playwright wrote no video for this take');
  }
  const dest = path.join(RAW_DIR, `${id}.webm`);
  fs.renameSync(path.join(dir, files[0]), dest);
  fs.rmSync(dir, { recursive: true, force: true });
  return { dest, marks };
}

(async () => {
  const server = await startServer(config.appUrl);

  const failed = [];
  const kept = {};
  const wanted = id => !only.length || only.includes(id);

  try {
    /* ── intro ── */
    if (config.intro?.enabled && wanted('intro')) {
      const html = buildIntroHtml(config.intro);
      const file = path.join(OUT_DIR, 'intro.html');
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(file, html);
      const hold = config.intro.holdSec ?? 4.5;
      const browser = await launch();
      try {
        await take(browser, 'intro', async page => {
          await page.goto('file://' + file.replace(/\\/g, '/'));
          // Wait for the animation to finish AND then hold, so the finished
          // card is actually on screen rather than flashing past.
          await page.waitForTimeout((introAnimationSec(config.intro) + hold) * 1000);
        });
        console.log('  intro');
      } catch (e) {
        failed.push(['intro', e.message]);
      } finally {
        await browser.close();
      }
    }

    /* ── segments ── */
    for (const seg of config.segments) {
      if (!wanted(seg.id)) continue;
      const recipe = recipes[seg.recipe];
      if (!recipe) { failed.push([seg.id, `no recipe named "${seg.recipe}"`]); continue; }

      let done = false;
      for (let attempt = 1; attempt <= retries && !done; attempt++) {
        const browser = await launch();
        try {
          const { marks } = await take(browser, seg.id, (page, mark) =>
            recipe(page, { ...seg.options, base: config.appUrl }, mark));
          kept[seg.id] = trimFromMarks(marks, seg.trimStartSec ?? 1.5);
          console.log(`  ${seg.id}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
          done = true;
        } catch (e) {
          if (attempt === retries) failed.push([seg.id, e.message]);
        } finally {
          await browser.close();
        }
      }
      if (!done && !keepGoing) break;
    }
  } finally {
    server.kill();
  }

  /*
    The snapshot lists only what verified, so compose.js stitches what exists
    rather than failing on segments this run was never asked to make.
  */
  const prev = previousSnapshot();
  const prevById = new Map((prev?.segments ?? []).map(s => [s.id, s]));
  const segments = config.segments
    .map(seg => {
      const trim = kept[seg.id] ?? (only.length ? prevById.get(seg.id) : undefined);
      return trim ? { ...seg, ...trim } : null;
    })
    .filter(Boolean);
  fs.writeFileSync(
    path.join(OUT_DIR, 'config.snapshot.json'),
    JSON.stringify({ ...config, segments }, null, 2),
  );

  if (failed.length) {
    console.error(`\n${failed.length} segment(s) failed — their clips were discarded:`);
    for (const [id, why] of failed) console.error(`  ${id}: ${why}`);
    console.error('\nScreenshots of each failure: scripts/demo-video/.output/failed/');
    process.exit(1);
  }
  console.log(`\n${segments.length + (config.intro?.enabled ? 1 : 0)} clip(s) recorded.`);
})().catch(e => { console.error(e); process.exit(1); });
