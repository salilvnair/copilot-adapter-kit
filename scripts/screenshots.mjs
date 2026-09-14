/* Captures every screen, tab and overlay to docs/screenshots/.
 *
 * Runs against the Vite dev server, so the fixture supplies providers, models
 * and a ledger — nothing here is anyone's real usage, and every page carries
 * the sample-data bar that says so.
 *
 *   node scripts/screenshots.mjs
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../webview-ui/node_modules/playwright-core/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const URL_BASE = 'http://localhost:5173';

const PANEL = { width: 1440, height: 900 };
const SIDEBAR = { width: 340, height: 820 };

let shot = 0;
const pad = () => String(++shot).padStart(2, '0');

async function main() {
  // Only the images: the folder also holds a hand-written index, and wiping the
  // directory wholesale deleted it on every run.
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) {
    if (f.endsWith('.png')) rmSync(join(OUT, f), { force: true });
  }

  const server = await startServer();
  const browser = await chromium.launch();

  try {
    await capturePanel(browser);
    await captureSidebar(browser);
    await captureLight(browser);
    console.log(`\n${shot} screenshots written to docs/screenshots/`);
  } finally {
    await browser.close();
    server.kill();
  }
}

/* ── The settings panel ───────────────────────────────────────────────── */

async function capturePanel(browser) {
  const page = await newPage(browser, PANEL);
  await page.goto(`${URL_BASE}/settings.html`);
  await page.locator('.prov').first().waitFor();

  const go = async name => {
    await page.locator('.rail-item', { hasText: name }).first().click();
    await page.waitForTimeout(400);
  };
  const snap = name => save(page, `${pad()}-${name}`);

  await snap('providers');

  await page.getByRole('button', { name: 'Add provider' }).click();
  await page.locator('.drawer').waitFor();
  await page.waitForTimeout(300);
  await snap('providers-add-drawer');
  await page.locator('.drawer .cak-close').click();
  await page.waitForTimeout(300);

  await page.locator('.prov .menu-trigger').first().click();
  await page.locator('.cak-menu').waitFor();
  await page.waitForTimeout(250);
  await snap('providers-overflow-menu');

  await page.locator('.cak-menu__item', { hasText: 'Remove provider' }).click();
  await page.getByTestId('cak-confirm').waitFor();
  await page.waitForTimeout(250);
  await snap('providers-confirm-remove');
  await page.getByTestId('cak-confirm').getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(250);

  await go('Models');
  await snap('models');
  await page.locator('.mrow').first().getByLabel(/^Edit /).click();
  await page.locator('.drawer').waitFor();
  await page.waitForTimeout(350);
  await snap('models-editor-drawer');
  await page.locator('.drawer .cak-close').click();
  await page.waitForTimeout(250);

  await go('API Keys');
  await snap('api-keys');

  await go('Spend Guard');
  await snap('spend-guard-today');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.waitForTimeout(400);
  await snap('spend-guard-history');
  await page.getByRole('tab', { name: 'Today' }).click();
  await page.waitForTimeout(300);

  await go('Configuration');
  await snap('configuration-general');
  await page.getByRole('tab', { name: 'Prompts' }).click();
  await page.waitForTimeout(350);
  await snap('configuration-prompts');
  await page.getByRole('tab', { name: 'Vision' }).click();
  await page.waitForTimeout(350);
  await snap('configuration-vision');

  await go('Git Tools');
  await snap('git-tools');
  await go('JSON Settings');
  await snap('json-settings');
  await go('Request Dumps');
  await snap('request-dumps');
  await go('Audit Log');
  await snap('audit-log');
  await page.locator('.audit-row').filter({ hasText: 'REFUSED' }).first().click();
  await page.waitForTimeout(350);
  await snap('audit-log-expanded');

  await go('Dev Tools');
  await snap('dev-tools');
  await go('Bin');
  await snap('bin');
  await go('Danger Zone');
  await snap('danger-zone');

  await page.keyboard.press('Control+k');
  await page.locator('.kpal').waitFor();
  await page.waitForTimeout(300);
  await snap('command-palette');
  await page.keyboard.press('Escape');

  await page.close();
}

/* ── The sidebar, at the width it gets ────────────────────────────────── */

async function captureSidebar(browser) {
  const page = await newPage(browser, SIDEBAR);
  await page.goto(`${URL_BASE}/sidebar.html`);
  await page.locator('.sidebar').waitFor();
  await page.waitForTimeout(400);
  await save(page, `${pad()}-sidebar-git-ai`);

  await page.getByRole('tab', { name: 'All' }).click();
  await page.waitForTimeout(300);
  await save(page, `${pad()}-sidebar-all-files`);
  await page.close();

  const guard = await newPage(browser, PANEL);
  await guard.goto(`${URL_BASE}/spend-guard.html`);
  await guard.locator('.sg').waitFor();
  await guard.waitForTimeout(500);
  await save(guard, `${pad()}-spend-guard-standalone-panel`);
  await guard.close();
}

/* ── The same thing on a light editor theme ───────────────────────────── */

async function captureLight(browser) {
  const page = await newPage(browser, PANEL);
  await page.goto(`${URL_BASE}/settings.html`);
  await page.locator('.prov').first().waitFor();
  // VS Code stamps this on the body; the panels follow it.
  await page.evaluate(() => document.body.classList.add('vscode-light'));
  await page.waitForTimeout(400);
  await save(page, `${pad()}-providers-light-theme`);

  await page.locator('.rail-item', { hasText: 'Spend Guard' }).first().click();
  await page.waitForTimeout(500);
  await save(page, `${pad()}-spend-guard-light-theme`);
  await page.close();
}

/* ── Plumbing ─────────────────────────────────────────────────────────── */

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'dark', deviceScaleFactor: 1 });
  return ctx.newPage();
}

async function save(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('  ' + name);
}

/** Start the dev server, or reuse one that is already up. */
async function startServer() {
  if (await reachable()) {
    console.log('reusing the dev server already on 5173\n');
    return { kill() {} };
  }

  const proc = spawn('npm', ['--prefix', 'webview-ui', 'run', 'dev'], {
    cwd: ROOT, shell: true, stdio: 'ignore', detached: false,
  });

  // Poll the port rather than parsing stdout: Vite's banner is coloured and
  // its wording moves between versions, and a missed match wedges the script.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await reachable()) {
      console.log('dev server up\n');
      return proc;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  proc.kill();
  throw new Error('dev server did not start within 60s');
}

async function reachable() {
  try {
    const res = await fetch(`${URL_BASE}/settings.html`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
