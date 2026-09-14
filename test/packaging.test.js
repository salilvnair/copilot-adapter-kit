// What actually ends up inside the .vsix.
//
// 2.0.0 shipped a `require('sql.js')` with nothing to resolve: .vscodeignore
// excludes node_modules, so every runtime dependency was left behind and the
// audit log died on activation with "Cannot find module 'sql.js'". Nothing in
// the test suite could see that, because the tests run from a source tree where
// node_modules is right there.
//
// So this suite reads the shipped bundle rather than the source: if the bundle
// asks for anything the VSIX does not carry, it fails here instead of on
// someone's machine after a marketplace update.

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const ROOT = process.argv[2];

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

const pkg = require(path.join(ROOT, 'package.json'));
const BUNDLE = path.join(ROOT, 'dist', 'extension.js');
const WASM = path.join(ROOT, 'dist', 'sql-wasm.wasm');

console.log('\n=== 1. the manifest points at the bundle ===');
{
  check('main is the bundle, not the tsc output', pkg.main === './dist/extension.js', pkg.main);
  check('packaging compiles first', pkg.scripts['vscode:prepublish'] === 'npm run compile',
    pkg.scripts['vscode:prepublish']);
  check('the bundle exists', fs.existsSync(BUNDLE));
  check('the WASM engine travels with it', fs.existsSync(WASM));
}

console.log('\n=== 2. the bundle asks for nothing that is not shipped ===');
{
  const src = fs.readFileSync(BUNDLE, 'utf8');
  const builtin = new Set(builtinModules);
  const required = new Set();
  for (const m of src.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) required.add(m[1]);

  const external = [...required].filter(id =>
    id !== 'vscode'                                   // provided by the host
    && !builtin.has(id)
    && !builtin.has(id.replace(/^node:/, ''))
    && !id.startsWith('.'));                          // relative, already inlined

  check('no bare module requires survive bundling', external.length === 0, external.join(', '));
  check('sql.js itself is inlined, not required',
    !required.has('sql.js') && /sql-wasm|initSqlJs|asm/.test(src));
  check('the bundle is a real bundle, not a stub', src.length > 50_000, `${src.length} bytes`);
}

console.log('\n=== 3. the wasm is loaded from where it is shipped ===');
{
  const src = fs.readFileSync(BUNDLE, 'utf8');
  check('locateFile points into dist', /["']dist["']\s*,\s*["']sql-wasm\.wasm["']/.test(src)
    || /sql-wasm\.wasm/.test(src), 'no reference to sql-wasm.wasm');

  const wasm = fs.readFileSync(WASM);
  check('the wasm is a real WebAssembly module',
    wasm.length > 100_000 && wasm[0] === 0x00 && wasm.slice(1, 4).toString() === 'asm',
    `${wasm.length} bytes, magic ${wasm.slice(0, 4).toString('hex')}`);
}

console.log('\n=== 4. the ignore list keeps the package to what is needed ===');
{
  const ignore = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  check('node_modules is excluded', ignore.includes('node_modules/**'));
  check('the tsc output is excluded — it is for the tests', ignore.includes('out/**'));
  check('sources are excluded', ignore.includes('src/**'));
  check('the webview source is excluded', ignore.includes('webview-ui/**'));
  check('dist is NOT excluded', !ignore.some(l => l === 'dist' || l === 'dist/**'));
  check('media is NOT excluded — the webview bundles live there',
    !ignore.some(l => l === 'media' || l === 'media/**'));
}

console.log('\n=== 5. the webview bundles are built and referenced ===');
{
  const dist = path.join(ROOT, 'media', 'dist');
  check('the webview build output exists', fs.existsSync(dist));
  const manifest = path.join(dist, '.vite', 'manifest.json');
  check('vite wrote its manifest, which the host reads to find the entries',
    fs.existsSync(manifest));
  if (fs.existsSync(manifest)) {
    const entries = Object.values(JSON.parse(fs.readFileSync(manifest, 'utf8')))
      .filter(e => e.isEntry);
    check('every entry names a file that exists',
      entries.every(e => fs.existsSync(path.join(dist, e.file))),
      entries.map(e => e.file).join(', '));
    check('all four surfaces are built', entries.length >= 4, String(entries.length));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
