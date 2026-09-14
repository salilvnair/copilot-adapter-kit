#!/usr/bin/env node
/**
 * Copies the rendered showcase out of .output/ (which is gitignored scratch)
 * and into docs/demo/, which is committed and is what the README points at.
 *
 * Kept as its own step rather than folded into compose, because committing a
 * few megabytes of binary is a decision worth making on purpose.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '.output');
const DEST = path.join(ROOT, '..', '..', 'docs', 'demo');
const name = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).output.name;

const FILES = [
  [`${name}.mp4`, 'showcase.mp4'],
  [`${name}-highlights.gif`, 'showcase.gif'],
  [`${name}-highlights.mp4`, 'showcase-short.mp4'],
];

fs.mkdirSync(DEST, { recursive: true });
let copied = 0;
for (const [from, to] of FILES) {
  const src = path.join(OUT, from);
  if (!fs.existsSync(src)) {
    console.warn(`  skipped ${to} — ${from} has not been rendered`);
    continue;
  }
  fs.copyFileSync(src, path.join(DEST, to));
  console.log(`  docs/demo/${to}  (${Math.round(fs.statSync(src).size / 1024)} KB)`);
  copied++;
}
if (!copied) {
  console.error('\nNothing to publish. Render it first:  npm run showcase');
  process.exit(1);
}
