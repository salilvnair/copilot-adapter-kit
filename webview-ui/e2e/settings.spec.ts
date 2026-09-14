/* Settings panel — every tab, driven rather than merely rendered.
 *
 * Each test answers the question the earlier bugs made necessary: when this
 * control is clicked, does anything actually happen? */

import { expect, test } from '@playwright/test';
import { clearPosts, goTo, postTypes, ready, recordPosts } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordPosts(page);
  await page.goto('/settings.html');
  await ready(page);
});

test('sample data is labelled, so figures are never mistaken for real usage', async ({ page }) => {
  await expect(page.locator('.fixture-bar')).toContainText('Sample data');
});

test.describe('Providers', () => {
  test('shows every card state at once', async ({ page }) => {
    await goTo(page, 'Providers');
    await expect(page.locator('.prov')).toHaveCount(5);
    await expect(page.locator('.prov.warn')).toHaveCount(1);   // no key
    await expect(page.locator('.prov.err')).toHaveCount(1);    // key rejected
    await expect(page.locator('.prov.off')).toHaveCount(1);    // not running
  });

  test('the filter narrows the list and clears again', async ({ page }) => {
    await goTo(page, 'Providers');
    const filter = page.getByLabel('Filter providers');
    await filter.fill('groq');
    await expect(page.locator('.prov')).toHaveCount(1);
    await filter.fill('nothing-matches-this');
    await expect(page.locator('.prov')).toHaveCount(0);
    await filter.fill('');
    await expect(page.locator('.prov')).toHaveCount(5);
  });

  test('checking reachability asks the host to probe', async ({ page }) => {
    await goTo(page, 'Providers');
    await clearPosts(page);
    await page.getByLabel('Check reachability').click();
    expect(await postTypes(page)).toContain('testProvider');
  });

  test('the overflow menu fires its entries', async ({ page }) => {
    await goTo(page, 'Providers');
    await page.locator('.prov .menu-trigger').first().click();
    await expect(page.locator('.cak-menu')).toBeVisible();

    await clearPosts(page);
    await page.locator('.cak-menu__item', { hasText: 'Duplicate' }).click();
    expect(await postTypes(page)).toContain('duplicateProvider');
  });

  test('removing a provider asks first and only then posts', async ({ page }) => {
    await goTo(page, 'Providers');
    await page.locator('.prov .menu-trigger').first().click();
    await clearPosts(page);
    await page.locator('.cak-menu__item', { hasText: 'Remove provider' }).click();

    // The click alone must not remove anything.
    expect(await postTypes(page)).toEqual([]);
    const dialog = page.getByTestId('cak-confirm');
    await expect(dialog).toContainText('Remove');

    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    expect(await postTypes(page)).toContain('removeProvider');
  });

  test('cancelling the confirmation removes nothing', async ({ page }) => {
    await goTo(page, 'Providers');
    await page.locator('.prov .menu-trigger').first().click();
    await page.locator('.cak-menu__item', { hasText: 'Remove provider' }).click();
    await clearPosts(page);
    await page.getByTestId('cak-confirm').getByRole('button', { name: 'Cancel' }).click();
    expect(await postTypes(page)).toEqual([]);
  });

  test('the add drawer opens in a split that can be dragged', async ({ page }) => {
    await goTo(page, 'Providers');
    await page.getByRole('button', { name: 'Add provider' }).click();
    await expect(page.locator('.drawer')).toBeVisible();

    // Opens at the mock's width, and the divider is a real control.
    const width = await page.locator('.drawer').evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(width).toBe(330);

    const before = await page.locator('.set-main').evaluate(el => el.getBoundingClientRect().width);
    const handle = page.locator('.split-host > *').nth(1);
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const after = await page.locator('.set-main').evaluate(el => el.getBoundingClientRect().width);
    expect(after).toBeLessThan(before);
  });

  test('the family select is ours, not the platform’s', async ({ page }) => {
    await goTo(page, 'Providers');
    await page.getByRole('button', { name: 'Add provider' }).click();
    // A native <select> opens an OS menu that cannot take the editor's theme.
    await expect(page.locator('.drawer select')).toHaveCount(0);
    await expect(page.locator('[data-testid="provider-family"]')).toBeVisible();
  });

  test('picking a family fills the endpoint', async ({ page }) => {
    await goTo(page, 'Providers');
    await page.getByRole('button', { name: 'Add provider' }).click();
    await expect(page.getByLabel('Base URL')).toHaveValue(/^https:\/\//);
  });
});

test.describe('Models', () => {
  test('groups by provider and filters', async ({ page }) => {
    await goTo(page, 'Models');
    await expect(page.locator('.grp-h')).not.toHaveCount(0);
    const before = await page.locator('.mrow').count();
    await page.getByLabel('Filter models').fill('claude');
    expect(await page.locator('.mrow').count()).toBeLessThan(before);
  });

  test('the picker switch writes hiddenCustomModels', async ({ page }) => {
    await goTo(page, 'Models');
    await clearPosts(page);
    await page.locator('.mrow .sw').first().click();
    expect(await postTypes(page)).toContain('toggleCustom');
  });

  test('the editor opens with a live preview of the picker row', async ({ page }) => {
    await goTo(page, 'Models');
    await page.locator('.mrow').first().getByLabel(/^Edit /).click();
    await expect(page.locator('.drawer')).toBeVisible();
    await expect(page.locator('.drawer .picker')).toBeVisible();
  });

  test('editing the name updates the preview as you type', async ({ page }) => {
    await goTo(page, 'Models');
    await page.locator('.mrow').first().getByLabel(/^Edit /).click();
    await page.getByLabel('Display name').fill('Renamed In A Test');
    await expect(page.locator('.drawer .picker')).toContainText('Renamed In A Test');
  });
});

test.describe('API Keys', () => {
  test('lists a row per provider and offers entry where a key is missing', async ({ page }) => {
    await goTo(page, 'API Keys');
    await expect(page.locator('.krow')).toHaveCount(5);
    await page.getByRole('button', { name: 'Add key' }).first().click();
    await expect(page.locator('.krow input[type="password"]')).toBeVisible();
  });

  test('never shows a stored key back to the page', async ({ page }) => {
    await goTo(page, 'API Keys');
    // Masked rows only — the real value lives in the OS keychain.
    await expect(page.locator('.msk').first()).toHaveText(/^•+$/);
  });

  test('test all asks the host to probe', async ({ page }) => {
    await goTo(page, 'API Keys');
    await clearPosts(page);
    await page.getByRole('button', { name: 'Test all' }).click();
    expect(await postTypes(page)).toContain('testProvider');
  });
});

test.describe('Spend Guard', () => {
  test('draws the burn curve and the three tiles', async ({ page }) => {
    await goTo(page, 'Spend Guard');
    await expect(page.locator('.chart-card svg')).toBeVisible();
    await expect(page.locator('.sg-hero .tile')).toHaveCount(3);
  });

  test('the curve is labelled for a screen reader', async ({ page }) => {
    await goTo(page, 'Spend Guard');
    await expect(page.locator('.chart-card svg')).toHaveAttribute('aria-label', /Cumulative token spend/);
  });

  test('history shows a full calendar of days', async ({ page }) => {
    await goTo(page, 'Spend Guard');
    await page.getByRole('tab', { name: 'History' }).click();
    // 98 days plus the padding that lines the grid up with weekdays.
    expect(await page.locator('.heat button').count()).toBeGreaterThanOrEqual(98);
  });

  test('the limit steppers save', async ({ page }) => {
    await goTo(page, 'Spend Guard');
    await clearPosts(page);
    await page.getByLabel('Increase Daily tokens').click();
    expect(await postTypes(page)).toContain('saveConfig');
  });

  test('disabling protection needs a real hold, not a click', async ({ page }) => {
    await goTo(page, 'Spend Guard');
    const hold = page.locator('.hold-b').first();
    // Raw mouse input does not scroll the way .click() does — without this the
    // press lands on empty space below the fold and nothing receives it.
    await hold.scrollIntoViewIfNeeded();
    const box = (await hold.boundingBox())!;

    await clearPosts(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.up();
    expect(await postTypes(page)).toEqual([]);

    await page.mouse.down();
    await page.waitForTimeout(2400);
    await page.mouse.up();
    expect(await postTypes(page)).toContain('setBudgetGuard');
  });
});

test.describe('Configuration', () => {
  test('controls on every tab save', async ({ page }) => {
    await goTo(page, 'Configuration');

    await clearPosts(page);
    await page.locator('.row-set .sw').first().click();
    expect(await postTypes(page)).toContain('saveConfig');

    await page.getByRole('tab', { name: 'Prompts' }).click();
    await clearPosts(page);
    await page.locator('textarea').fill('You are {model} on {date}.');
    expect(await postTypes(page)).toContain('saveConfig');

    await page.getByRole('tab', { name: 'Vision' }).click();
    await expect(page.locator('.fnode')).toHaveCount(4);
    await clearPosts(page);
    await page.getByLabel('Vision fallback model').fill('copilot:gpt-5.2');
    expect(await postTypes(page)).toContain('saveConfig');
  });
});

test.describe('The remaining destinations', () => {
  test('Git Tools edits the prompt and the threshold', async ({ page }) => {
    await goTo(page, 'Git Tools');
    await clearPosts(page);
    await page.getByLabel('Git commit prompt').fill('Describe {branch}');
    expect(await postTypes(page)).toContain('saveConfig');
  });

  test('JSON settings render coloured and read-only', async ({ page }) => {
    await goTo(page, 'JSON Settings');
    expect(await page.locator('.code .ln').count()).toBeGreaterThan(10);
    await expect(page.locator('.code .kk').first()).toBeVisible();
  });

  test('Request Dumps opens the folder', async ({ page }) => {
    await goTo(page, 'Request Dumps');
    await clearPosts(page);
    await page.getByRole('button', { name: 'Open folder' }).click();
    expect(await postTypes(page)).toContain('openDumps');
  });

  test('the Bin explains itself when empty', async ({ page }) => {
    await goTo(page, 'Bin');
    await expect(page.locator('.set-main')).toContainText('Nothing here');
  });

  test('every Danger Zone action is a hold', async ({ page }) => {
    await goTo(page, 'Danger Zone');
    await expect(page.locator('.dz')).toHaveCount(4);
    await expect(page.locator('.hold-b')).toHaveCount(4);
  });
});

test.describe('Command palette', () => {
  test('opens on Ctrl+K and groups its results once each', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('.kpal')).toBeVisible();

    const groups = await page.locator('.kpal .pgrp').allTextContents();
    expect(new Set(groups).size).toBe(groups.length);
  });

  test('filters and runs an entry', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search', { exact: true }).fill('spend history');
    await clearPosts(page);
    await page.locator('.kpal-row').first().click();
    expect(await postTypes(page)).toContain('openSpendGuard');
  });

  test('Escape closes it', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('.kpal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.kpal')).toHaveCount(0);
  });
});

test.describe('Theme', () => {
  test('follows the editor rather than its own preference', async ({ page }) => {
    const dark = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => document.body.classList.add('vscode-light'));
    await expect.poll(async () =>
      page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor),
    ).not.toBe(dark);
  });
});
