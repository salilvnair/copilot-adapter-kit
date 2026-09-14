const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copy sql.js's WASM binary into dist/ so it ships with the extension.
 *
 * sql.js IS SQLite compiled to WebAssembly — sql-wasm.js is only the loader,
 * and the engine itself is this file. The loader gets bundled into
 * dist/extension.js below; the binary cannot be, so it travels beside it and
 * storage/db.ts points `locateFile` here.
 *
 * This is the half that was missing: .vscodeignore excludes node_modules, so
 * an unbundled build shipped a `require('sql.js')` with nothing to resolve.
 */
function copyWasmFile() {
  const src = path.join('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const dst = path.join('dist', 'sql-wasm.wasm');
  if (!fs.existsSync(src)) {
    console.warn('[wasm] sql-wasm.wasm not found in node_modules/sql.js/dist — skip');
    return;
  }
  fs.mkdirSync('dist', { recursive: true });
  try {
    fs.copyFileSync(src, dst);
    console.log('[wasm] copied sql-wasm.wasm → dist/sql-wasm.wasm');
  } catch (e) {
    if (e.code === 'EPIPE' || e.code === 'EBUSY') {
      console.warn(`[wasm] sql-wasm.wasm locked (${e.code}) — using existing copy`);
    } else {
      throw e;
    }
  }
}

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
      copyWasmFile();
    });
  },
};

async function main() {
  // ── Extension bundle ──────────────────────────────────────────────────────
  // Everything the extension host needs, in one file. 'vscode' is provided by
  // the host itself and must stay external.
  const ctx = await esbuild.context({
    entryPoints: ['src/entry.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
