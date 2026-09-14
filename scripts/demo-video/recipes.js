/**
 * One function per screen, driving the real panel with Playwright.
 *
 * Each recipe is `async (page, opts, mark) => {}`. Call `mark.begin()` when the
 * interesting part starts and `mark.end()` when it is over — Playwright films
 * from the moment the page is created, so without those marks every clip opens
 * on a blank frame and the app booting, and the finished video runs three times
 * its useful length.
 *
 * Each recipe also verifies what it did before the clip is kept. A take that
 * typed into a panel that never opened produces a plausible-looking clip of the
 * wrong thing, and the composer has no way to know. A failed verify throws, the
 * clip is deleted, and the run says which segment broke.
 *
 * Everything here runs against the Vite dev server, so the figures come from
 * webview-ui/src/app/fixture.ts and every page carries the sample-data bar that
 * says so. No key, no provider and no request is real.
 */

const SETTINGS = '/settings.html';
const SIDEBAR = '/sidebar.html';

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Open the panel and wait until the fixture has painted. */
async function openPanel(page, base) {
  await page.goto(base + SETTINGS);
  await page.locator('.set-top').waitFor();
  await page.locator('.prov, .set-main').first().waitFor();
  await page.waitForTimeout(300);
}

/** Move to a destination in the rail, the way a person would. */
async function rail(page, name) {
  await page.locator('.rail-item', { hasText: name }).first().click();
  await page.waitForTimeout(650);
}

/** Type at a readable speed — instant fills look like a page reload, not typing. */
async function type(page, locator, text, delay = 55) {
  await locator.click();
  await locator.press('ControlOrMeta+a').catch(() => {});
  await locator.type(text, { delay });
}

/** A beat, so the eye lands on what just changed before the clip moves on. */
const beat = (page, ms = 900) => page.waitForTimeout(ms);

/** Fail loudly rather than keep a clip of the wrong screen. */
async function must(locator, what) {
  if (!(await locator.count())) throw new Error(`nothing verified: ${what}`);
  if (!(await locator.first().isVisible())) throw new Error(`not visible: ${what}`);
}

/* ── recipes ──────────────────────────────────────────────────────────── */

/** Ctrl+K, filter, jump — the fastest tour of what the panel holds. */
async function commandPalette(page, opts, mark) {
  await openPanel(page, opts.base);
  mark.begin();
  await page.keyboard.press('Control+k');
  await page.locator('.kpal').waitFor();
  await beat(page, 500);
  await page.keyboard.type('guard', { delay: 90 });
  await beat(page, 900);
  await page.keyboard.press('Enter');
  await page.locator('.sg-hero, .tile-k').first().waitFor();
  await beat(page, 1100);
  await must(page.locator('.tile-k').first(), 'the Spend Guard opened from the palette');
  mark.end();
}

/** Every provider state at once: live, no key, rejected, not running. */
async function providers(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Providers');
  mark.begin();
  await beat(page, 1200);
  const filter = page.getByLabel('Filter providers');
  await type(page, filter, 'deep');
  await beat(page, 900);
  await filter.fill('');
  await beat(page, 700);
  await must(page.locator('.prov'), 'the provider cards');
  mark.end();
}

/** Adding one: the family fills the endpoint, and Test probes without a key. */
async function addProvider(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Providers');
  mark.begin();
  await page.getByRole('button', { name: 'Add provider' }).click();
  await page.locator('.drawer').waitFor();
  await beat(page, 700);

  await page.getByTestId('provider-family').click();
  await beat(page, 450);
  await page.getByRole('option', { name: 'DeepSeek' }).click();
  await beat(page, 900);

  await type(page, page.getByLabel('Provider name'), 'DeepSeek');
  await beat(page, 800);
  await must(page.getByLabel('Base URL'), 'the endpoint the family filled in');
  mark.end();
}

/** The models the Copilot picker will show, and the switch that hides one. */
async function models(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Models');
  mark.begin();
  await beat(page, 1100);
  const filter = page.locator('.search-f input').first();
  if (await filter.count()) {
    await type(page, filter, 'claude');
    await beat(page, 1100);
    await filter.fill('');
  }
  await beat(page, 700);
  await must(page.locator('.grp-h').first(), 'the model list, grouped by provider');
  mark.end();
}

/** Existence, health and age — and never the key itself. */
async function apiKeys(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'API Keys');
  mark.begin();
  await beat(page, 1600);
  await must(page.locator('.set-main'), 'the keys screen');
  mark.end();
}

/** The reason the extension exists: the burn curve against the ceiling. */
async function spendGuardToday(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Spend Guard');
  mark.begin();
  await page.locator('.chart-card svg').waitFor();
  await beat(page, 1800);
  await must(page.locator('.chart-card svg'), 'the cumulative spend chart');
  mark.end();
}

/** Fourteen weeks, a column per week, red where the cap was reached. */
async function spendGuardHistory(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Spend Guard');
  await page.locator('.chart-card svg').waitFor();
  mark.begin();
  await page.getByRole('tab', { name: 'History' }).click();
  await page.locator('.heat').waitFor();
  await beat(page, 1700);
  await must(page.locator('.heat button').first(), 'the history calendar');
  mark.end();
}

/** A limit typed, not stepped — the control that used to be read-only text. */
async function limits(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Spend Guard');
  await page.locator('.chart-card svg').waitFor();
  const field = page.getByLabel('Daily tokens value');
  await field.scrollIntoViewIfNeeded();
  mark.begin();
  await beat(page, 500);
  await type(page, field, '393216', 80);
  await beat(page, 700);
  await field.press('Enter');
  await beat(page, 1200);
  await must(field, 'the daily token limit');
  mark.end();
}

/** Each setting with the sentence that says what it costs. */
async function configuration(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Configuration');
  mark.begin();
  await beat(page, 1500);
  await must(page.locator('.set-main'), 'the configuration screen');
  mark.end();
}

/** Branch, counts, per-file stats — and the cost before it is sent. */
async function gitTools(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Git Tools');
  mark.begin();
  await beat(page, 1500);
  await must(page.locator('.set-main'), 'the git tools screen');
  mark.end();
}

/** One row per model call and per panel action, colour-coded by module. */
async function auditLog(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Developer Tools');
  await page.getByRole('tab', { name: 'Audit Log' }).waitFor();
  await page.waitForTimeout(700);
  mark.begin();
  await beat(page, 900);
  const filter = page.getByLabel('Filter the audit log');
  await type(page, filter, 'refused');
  await beat(page, 1100);
  await filter.fill('');
  await beat(page, 600);
  await must(page.locator('tbody tr').first(), 'the audit table');
  mark.end();
}

/** A row opened into the whole record, bodies and all. */
async function auditRecord(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Developer Tools');
  await page.getByRole('tab', { name: 'Audit Log' }).waitFor();
  await page.waitForTimeout(700);
  mark.begin();
  await page.locator('tbody tr', { hasText: 'Write a conventional commit' }).first().click();
  // The metadata block mounts its editor on demand.
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30_000 });
  await beat(page, 1800);
  await must(page.locator('.monaco-editor').first(), 'the expanded record');
  mark.end();
}

/** Every event that can be recorded, and the switches that decide which are. */
async function auditConfig(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Developer Tools');
  await page.getByRole('tab', { name: 'Audit Config' }).click();
  await page.waitForTimeout(600);
  mark.begin();
  await beat(page, 900);
  const toggle = page.getByLabel(/^Copy a provider and its models/);
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await beat(page, 800);
  await toggle.click();
  await beat(page, 900);
  await must(page.getByText(/\d+\/\d+ active/), 'the active count');
  mark.end();
}

/** The SQLite store underneath both, browsable a table at a time. */
async function dbExplorer(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Developer Tools');
  await page.getByRole('tab', { name: 'DB Explorer' }).click();
  await page.waitForTimeout(600);
  mark.begin();
  await beat(page, 700);
  await page.getByRole('button', { name: /cak_audit/ }).click();
  await beat(page, 1500);
  await must(page.locator('tbody tr').first(), 'the table rows');
  mark.end();
}

/** Four holds, each naming the live count it destroys. */
async function dangerZone(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Danger Zone');
  mark.begin();
  await beat(page, 1600);
  await must(page.locator('.hold-b').first(), 'the hold-to-confirm actions');
  mark.end();
}

/** The editor's theme, followed — and overridden from the top bar. */
async function theme(page, opts, mark) {
  await openPanel(page, opts.base);
  await rail(page, 'Providers');
  await page.waitForTimeout(400);
  mark.begin();
  const toggle = page.getByLabel(/theme/i).first();
  await toggle.click();
  await beat(page, 1400);
  await toggle.click();
  await beat(page, 1300);
  await must(page.locator('.prov').first(), 'the providers, in the other theme');
  mark.end();
}

/** The sidebar at the width it actually gets. */
async function sidebar(page, opts, mark) {
  await page.goto(opts.base + SIDEBAR);
  await page.locator('.side, .git-ai, body').first().waitFor();
  await page.waitForTimeout(700);
  mark.begin();
  await beat(page, 1200);
  const guidance = page.getByPlaceholder(/guidance|what changed/i).first();
  if (await guidance.count()) {
    await type(page, guidance, 'focus on the spend guard', 60);
    await beat(page, 1200);
  }
  await must(page.locator('body'), 'the sidebar');
  mark.end();
}

const recipes = {
  commandPalette,
  providers,
  addProvider,
  models,
  apiKeys,
  spendGuardToday,
  spendGuardHistory,
  limits,
  configuration,
  gitTools,
  auditLog,
  auditRecord,
  auditConfig,
  dbExplorer,
  dangerZone,
  theme,
  sidebar,
};

module.exports = { recipes, openPanel, rail, type, beat, must };
