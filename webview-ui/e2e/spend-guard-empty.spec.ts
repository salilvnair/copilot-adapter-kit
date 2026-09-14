/* The Spend Guard on a day nothing has happened yet.
 *
 * The fixture is a busy week, so every other spec exercises the populated path.
 * A fresh install has an empty ledger and no history at all, which is the state
 * the very first user sees — and the one that shipped broken.
 */

import { expect, test } from '@playwright/test';

/** A real, freshly-initialised ledger: today at zero, nothing filed behind it. */
const EMPTY_BUDGET = {
  caps: {
    enforce: true, dailyTokenLimit: 2_000_000, dailyCostLimitUsd: 25,
    maxInputTokensPerRequest: 200_000, maxOutputTokens: 0, maxTurnsPerConversation: 50,
    outputFallback: 16_384,
  },
  day: {
    day: new Date().toISOString().slice(0, 10),
    inputTokens: 0, outputTokens: 0, costUsd: 0, requests: 0, blocked: 0,
    estimated: false, byModel: {},
    hourly: new Array(24).fill(0), hourlyCost: new Array(24).fill(0), refusals: [],
  },
  history: [],
  tokenPct: 0, costPct: 0, overLimit: false, nearLimit: false,
};

/** Loads the panel and answers getState the way the host would. */
async function openEmpty(page: import('@playwright/test').Page, budget: unknown) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(budgetArg => {
    // Answer before the dev fixture can, so the empty ledger is what renders.
    window.addEventListener('cak:post', (e: Event) => {
      if ((e as CustomEvent).detail?.type !== 'getState') return;
      window.postMessage({ type: 'state', payload: { budget: budgetArg, isSample: false } }, '*');
    });
  }, budget);

  await page.goto('/settings.html');
  await page.locator('.set-top').waitFor();
  await page.locator('.rail-item', { hasText: 'Spend Guard' }).first().click();
  await page.getByRole('tab', { name: 'Today' }).waitFor();
  return errors;
}

test('History renders with no history at all', async ({ page }) => {
  const errors = await openEmpty(page, EMPTY_BUDGET);

  await page.getByRole('tab', { name: 'History' }).click();

  // The panel painted something, rather than a blank surface.
  await expect(page.locator('.heat')).toBeVisible();
  expect(await page.locator('.heat button').count()).toBeGreaterThanOrEqual(98);
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('History survives a day summary missing its figures', async ({ page }) => {
  // A day filed by an older build, before a field existed. globalState is not
  // migrated, so whatever was written stays written.
  const errors = await openEmpty(page, {
    ...EMPTY_BUDGET,
    history: [
      { day: '2026-09-01', tokens: 4000 },                      // no costUsd
      { day: '2026-09-02', tokens: 9000, costUsd: 0.4 },        // no requests
      { day: '2026-09-03' },                                    // nothing at all
    ],
  });

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.locator('.heat')).toBeVisible();
  // The readable parts are still added up rather than the view giving up.
  await expect(page.getByText('13.0K tokens')).toBeVisible();
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('Today renders on an empty ledger', async ({ page }) => {
  const errors = await openEmpty(page, EMPTY_BUDGET);
  await expect(page.locator('.tile-k').first()).toBeVisible();
  await expect(page.getByText('of 2.00M')).toBeVisible();
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
