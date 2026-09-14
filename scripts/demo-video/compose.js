#!/usr/bin/env node
/**
 * Composes the raw clips recorded by record.js into the final showcase:
 * per-clip camera effect (config.json's `effect`, via effects.js) applied
 * with ffmpeg zoompan, then chained with crossfade transitions (xfade).
 * Exports an .mp4 always, and a .gif too if run with --gif (GIF's 256-color
 * palette bands on smooth zoom/crossfade content, so prefer the mp4 unless
 * you specifically need a GIF for a place that can't embed video).
 *
 * Usage: node scripts/demo-video/compose.js [path/to/config.json] [--gif]
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { buildZoompanFilter } = require('./effects');

const ROOT = __dirname;
const args = process.argv.slice(2).filter((a) => a !== '--gif' && a !== '--highlights');
const makeGif = process.argv.includes('--gif');
/*
  A README cannot carry a ninety-second GIF — the full showcase is tens of
  megabytes at any palette worth looking at. `--highlights` composes only the
  segments config.json names, into a second, short file that can live in the
  repository; the mp4 stays the full thing.
*/
const highlightsOnly = process.argv.includes('--highlights');
/*
  The snapshot the recorder wrote, in preference to config.json.

  `record.js` writes `config.snapshot.json` listing only the segments that
  actually produced a verified clip, so composing from it means a `--only` run
  stitches what it recorded instead of failing on the twenty clips it was never
  asked to make. With no snapshot — someone composing by hand — config.json is
  still the source.
*/
const OUT_DIR_EARLY = path.join(ROOT, '.output');
const snapshot = path.join(OUT_DIR_EARLY, 'config.snapshot.json');
const configPath = path.resolve(args[0] || (fs.existsSync(snapshot) ? snapshot : path.join(ROOT, 'config.json')));
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
if (configPath === snapshot) {
  console.log('Composing the segments record.js verified.');
  /*
    The snapshot froze config.json as it was when the clips were shot, which is
    right for the segment list and their trims — those are facts about the
    recording. It is wrong for everything else: changing a transition, a GIF
    size or the highlight list should not mean re-recording twenty clips. Those
    are read live.
  */
  try {
    const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf-8'));
    for (const key of ['transitions', 'output', 'intro', 'highlights']) {
      if (live[key] !== undefined) config[key] = live[key];
    }
    // Effects are per segment, and also composition rather than recording.
    const effects = new Map((live.segments ?? []).map(s2 => [s2.id, s2.effect]));
    for (const seg of config.segments) {
      if (effects.has(seg.id)) seg.effect = effects.get(seg.id);
    }
  } catch { /* no config.json beside the snapshot — use the snapshot as-is */ }
}

const OUT_DIR = path.join(ROOT, '.output');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const PROC_DIR = path.join(OUT_DIR, 'processed');
fs.mkdirSync(PROC_DIR, { recursive: true });

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function ffprobeDuration(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]).toString().trim();
  return parseFloat(out);
}

function checkFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    console.error('ffmpeg not found on PATH. Install it (winget install Gyan.FFmpeg, or brew install ffmpeg) and re-run.');
    process.exit(1);
  }
}
checkFfmpeg();

const { width, height, fps } = config.output;

// clip plan: intro first (no trim), then each segment (trimmed per config).
const plan = [];
if (config.intro?.enabled && !highlightsOnly) {
  plan.push({ id: 'intro', raw: path.join(RAW_DIR, 'intro.webm'), trimStartSec: 0, effect: config.intro.effect || 'zoom-in' });
}
const wanted = highlightsOnly && Array.isArray(config.highlights)
  ? new Set(config.highlights)
  : null;
for (const seg of config.segments) {
  if (wanted && !wanted.has(seg.id)) continue;
  plan.push({
    id: seg.id,
    raw: path.join(RAW_DIR, seg.id + '.webm'),
    trimStartSec: seg.trimStartSec ?? 1.5,
    /* Where the recorder said the segment stopped being interesting. Absent
       for a clip recorded before record.js marked its takes, or for one whose
       driver never marked an end — both keep the whole tail. */
    endAtSec: seg.endAtSec,
    effect: seg.effect || 'zoom-in',
  });
}

for (const clip of plan) {
  if (!fs.existsSync(clip.raw)) {
    throw new Error(
      `Missing clip for "${clip.id}".\n`
      + 'record.js keeps a clip only when its segment verified, so this segment '
      + 'either was never recorded or failed.\n'
      + `Re-record just it:  npm run demo-video:record -- --only ${clip.id}`
    );
  }
}

console.log('Processing clips (trim + camera effect)...');
const processed = plan.map((clip, i) => {
  const rawDuration = ffprobeDuration(clip.raw);
  const endAt = typeof clip.endAtSec === 'number' ? Math.min(rawDuration, clip.endAtSec) : rawDuration;
  const duration = Math.max(0.5, endAt - clip.trimStartSec);
  const totalFrames = Math.round(duration * fps);
  const zoompan = buildZoompanFilter(clip.effect, totalFrames, { width, height, fps });
  const outFile = path.join(PROC_DIR, `${i}_${clip.id}.mp4`);
  const vfParts = [];
  if (zoompan) {
    // zoompan rendered at 2x working resolution (see effects.js) to avoid
    // per-frame rounding jitter on crisp UI edges — scale back down here.
    vfParts.push(zoompan, `scale=${width}:${height}:flags=lanczos`);
  }
  const ffArgs = ['-ss', String(clip.trimStartSec), '-i', clip.raw, '-t', String(duration)];
  if (vfParts.length) ffArgs.push('-vf', vfParts.join(','));
  ffArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', outFile);
  ffmpeg(ffArgs);
  const outDuration = ffprobeDuration(outFile);
  console.log(`  ${clip.id}: ${outDuration.toFixed(2)}s, effect="${typeof clip.effect === 'string' ? clip.effect : JSON.stringify(clip.effect)}"`);
  return { ...clip, outFile, duration: outDuration };
});

console.log('Chaining transitions...');
const transDur = config.transitions?.durationSec ?? 0.7;
const transType = config.transitions?.type ?? 'zoomin';

let filterParts = [];
let offset = processed[0].duration - transDur;
let running = processed[0].duration;
let lastLabel = '0:v';
for (let i = 1; i < processed.length; i++) {
  const outLabel = i === processed.length - 1 ? 'vout' : `vx${i}`;
  filterParts.push(`[${lastLabel}][${i}:v]xfade=transition=${transType}:duration=${transDur}:offset=${offset.toFixed(3)}[${outLabel}]`);
  running = running + processed[i].duration - transDur;
  offset = running - transDur;
  lastLabel = outLabel;
}

const inputArgs = processed.flatMap((c) => ['-i', c.outFile]);
const suffix = highlightsOnly ? '-highlights' : '';
const finalMp4 = path.join(OUT_DIR, `${config.output.name}${suffix}.mp4`);
ffmpeg([
  ...inputArgs,
  '-filter_complex', filterParts.join('; '),
  '-map', '[vout]',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', String(fps),
  finalMp4,
]);
console.log('Wrote', finalMp4, `(${running.toFixed(1)}s)`);

if (makeGif) {
  const palette = path.join(OUT_DIR, 'palette.png');
  const finalGif = path.join(OUT_DIR, `${config.output.name}${suffix}.gif`);
  // 10fps at 720px: a GIF's 256-colour palette bands on smooth zooms anyway,
  // and this is the difference between a file a README can carry and one it
  // cannot. The mp4 is the good-looking one.
  // A README carries the highlights GIF, so it is sized for that: a GIF's
  // 256-colour palette bands on smooth zooms whatever you do, and the mp4 is
  // the good-looking one. The full GIF is a convenience, not a deliverable.
  const gifCfg = (highlightsOnly ? config.output.gifHighlights : config.output.gif) || {};
  const scale = gifCfg.width ?? (highlightsOnly ? 600 : 800);
  const fpsOut = gifCfg.fps ?? (highlightsOnly ? 8 : 12);
  const chain = `fps=${fpsOut},scale=${scale}:-1:flags=lanczos`;
  ffmpeg(['-i', finalMp4, '-vf', `${chain},palettegen=stats_mode=diff`, palette]);
  ffmpeg(['-i', finalMp4, '-i', palette, '-lavfi', `${chain}[x];[x][1:v]paletteuse=dither=bayer`, '-loop', '0', finalGif]);
  const kb = Math.round(fs.statSync(finalGif).size / 1024);
  console.log('Wrote', finalGif, `(${kb} KB)`);
}
