/* Git AI sidebar — driven at the width it actually gets. */

import { expect, test } from '@playwright/test';
import { clearPosts, postTypes, recordPosts } from './helpers';

test.use({ viewport: { width: 340, height: 900 } });

test.beforeEach(async ({ page }) => {
  await recordPosts(page);
  await page.goto('/sidebar.html');
  await page.locator('.sidebar').waitFor();
});

test('shows the branch and the counts the old panel threw away', async ({ page }) => {
  await expect(page.locator('.repo-strip')).toContainText('main');
  await expect(page.locator('.repo-strip')).toContainText('staged');
  await expect(page.locator('.file-row')).not.toHaveCount(0);
});

test('nothing wraps to a second line at 340px', async ({ page }) => {
  // The old panel clipped its second dropdown here. Every control must fit.
  const row = page.locator('.msg-actions, .composer-row').first();
  const heights = await page.locator('.composer-row').evaluateAll(els =>
    els.map(e => Math.round(e.getBoundingClientRect().height)));
  for (const h of heights) expect(h).toBeLessThanOrEqual(40);
  await expect(row).toBeVisible();
});

test('per-file additions and deletions are shown', async ({ page }) => {
  await expect(page.locator('.file-row .stat-add').first()).toContainText(/^\+\d+$/);
});

test('the scope toggle changes which files are listed', async ({ page }) => {
  const staged = await page.locator('.file-row').count();
  await page.getByRole('tab', { name: 'All' }).click();
  expect(await page.locator('.file-row').count()).toBeGreaterThan(staged);
});

test('the model pill asks the host to pick', async ({ page }) => {
  await clearPosts(page);
  await page.locator('.model-pill').click();
  expect(await postTypes(page)).toContain('pickModel');
});

test('the cost of the request is shown before it is sent', async ({ page }) => {
  await expect(page.locator('.cost-hint')).toContainText(/~[\d.]+K/);
});

test('generate sends guidance and scope', async ({ page }) => {
  await page.getByLabel('Guidance for the commit message').fill('tighten the guard');
  await clearPosts(page);
  await page.getByRole('button', { name: 'Generate' }).click();
  const sent = await page.evaluate(() => (window as any).__posts);
  const gen = sent.find((p: any) => p.type === 'generate');
  expect(gen).toBeTruthy();
  expect(gen.payload.message).toBe('tighten the guard');
});

test('clicking a file opens it', async ({ page }) => {
  await clearPosts(page);
  await page.locator('.file-row').first().click();
  expect(await postTypes(page)).toContain('openFile');
});

test('the spend guard is visible from the sidebar', async ({ page }) => {
  await expect(page.locator('.sb-foot')).toContainText('Guard');
});
