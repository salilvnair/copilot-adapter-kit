/* Audit log — the record of what was sent and what was clicked. */

import { expect, test } from '@playwright/test';
import { clearPosts, goTo, postTypes, ready, recordPosts } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordPosts(page);
  await page.goto('/settings.html');
  await ready(page);
  await goTo(page, 'Audit Log');
});

test('lists model calls and panel actions together, newest first', async ({ page }) => {
  await expect(page.locator('.audit-row')).toHaveCount(7);
  const first = page.locator('.audit-row').first();
  await expect(first).toContainText(/action|call/);
});

test('a refusal is recorded with the reason it was refused', async ({ page }) => {
  await expect(page.locator('.audit-row', { hasText: 'REFUSED' }))
    .toContainText('Daily token budget reached');
});

test('the three kinds can be told apart', async ({ page }) => {
  await page.getByRole('tab', { name: 'Calls' }).click();
  const calls = await page.locator('.audit-row').count();
  await page.getByRole('tab', { name: 'Actions' }).click();
  const actions = await page.locator('.audit-row').count();
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  expect(await page.locator('.audit-row').count()).toBe(calls + actions);
});

test('a row expands into the whole record', async ({ page }) => {
  await page.locator('.audit-row').filter({ hasText: 'REFUSED' }).click();
  await expect(page.locator('.audit-detail')).toBeVisible();
  await expect(page.locator('.audit-kv')).toContainText('Conversation');
  await expect(page.locator('.audit-kv')).toContainText('Duration');
});

test('the filter narrows the list', async ({ page }) => {
  const before = await page.locator('.audit-row').count();
  await page.getByLabel('Filter the audit log').fill('anthropic');
  expect(await page.locator('.audit-row').count()).toBeLessThan(before);
  await page.getByLabel('Filter the audit log').fill('');
  expect(await page.locator('.audit-row').count()).toBe(before);
});

test('it says plainly when bodies are not being recorded', async ({ page }) => {
  await expect(page.locator('.audit-note')).toContainText('your source code');
  await expect(page.locator('.audit-row', { hasText: 'REFUSED' })).toBeVisible();
  await page.locator('.audit-row').filter({ hasText: 'REFUSED' }).click();
  await expect(page.locator('.audit-detail')).toContainText('Bodies were not recorded');
});

test('clearing asks first', async ({ page }) => {
  await clearPosts(page);
  await page.getByLabel('Clear the audit log').click();
  expect(await postTypes(page)).toEqual([]);
  await expect(page.getByTestId('cak-confirm')).toContainText('cannot be recovered');

  await page.getByTestId('cak-confirm').getByRole('button', { name: /^Clear/ }).click();
  expect(await postTypes(page)).toContain('clearAudit');
});

test('export and reload reach the host', async ({ page }) => {
  await clearPosts(page);
  await page.getByLabel('Export as JSON').click();
  expect(await postTypes(page)).toContain('exportAudit');

  await clearPosts(page);
  await page.getByLabel('Reload').click();
  expect(await postTypes(page)).toContain('loadAudit');
});
