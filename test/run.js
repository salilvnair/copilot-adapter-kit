// Plain-node test runner. No framework: these exercise compiled output in out/
// against a stubbed vscode module, which needs no harness.
const { spawnSync } = require('child_process');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const SUITES = ['spend-guard.test.js', 'webview-host.test.js', 'message-contract.test.js', 'audit-db.test.js', 'status-bar.test.js', 'status-menu.test.js', 'packaging.test.js', 'palette-commands.test.js', 'health.test.js'];

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n──────── ${suite} ────────`);
  const r = spawnSync(process.execPath, [join(__dirname, suite), ROOT], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
