/* Developer Tools — the three tabs, driven rather than merely rendered.
 *
 * Ported from daakia, so the thing worth testing is that the port is wired:
 * the toolbar controls post, the table expands into a record, the config
 * switches persist, and the DB tabs actually ask for and render rows.
 */

import { expect, test } from '@playwright/test';
import { clearPosts, postTypes, recordPosts } from './helpers';

test.beforeEach(async ({ page }) => {
  await recordPosts(page);
  await page.goto('/settings.html');
  await page.locator('.set-top').waitFor();
  await page.locator('.rail-item', { hasText: 'Developer Tools' }).first().click();
  await page.getByRole('tab', { name: 'Audit Log' }).waitFor();
});

test('exactly three tabs, in daakia’s order', async ({ page }) => {
  await expect(page.locator('[role="tab"]')).toHaveText(['Audit Log', 'Audit Config', 'DB Explorer']);
});

test.describe('Audit Log', () => {
  test('model calls and panel actions land in one table', async ({ page }) => {
    const rows = page.locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(5);
    // Both kinds, distinguishable by their module badge. The badges are
    // uppercased in CSS, so the DOM keeps the source casing.
    await expect(page.getByText('Chat', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Providers', { exact: true }).first()).toBeVisible();
  });

  test('a refusal reads differently to a failure', async ({ page }) => {
    await expect(page.getByText('refused', { exact: true })).toBeVisible();
    await expect(page.getByText('error', { exact: true }).first()).toBeVisible();
  });

  test('a row expands into the whole record', async ({ page }) => {
    await page.locator('tbody tr', { hasText: 'Daily token budget reached' }).first().click();
    await expect(page.getByText('Conversation')).toBeVisible();
    await expect(page.getByText('METADATA')).toBeVisible();
    // The editor, not a bare <pre> — the gutter is what says Monaco mounted.
    await expect(page.locator('.monaco-editor').first()).toBeVisible();
  });

  test('bodies being off is explained rather than left blank', async ({ page }) => {
    await page.locator('tbody tr', { hasText: 'Daily token budget reached' }).first().click();
    await expect(page.getByText(/Bodies were not recorded/)).toBeVisible();
  });

  test('the filter narrows the table', async ({ page }) => {
    const before = await page.locator('tbody tr').count();
    await page.getByLabel('Filter the audit log').fill('deepseek');
    expect(await page.locator('tbody tr').count()).toBeLessThan(before);
    await page.getByLabel('Clear filter').click();
    expect(await page.locator('tbody tr').count()).toBe(before);
  });

  test('refresh asks the host again', async ({ page }) => {
    await clearPosts(page);
    await page.getByLabel('Refresh').click();
    const types = await postTypes(page);
    expect(types).toContain('aiAudit:load');
    expect(types).toContain('uiAudit:load');
  });

  test('clearing the log is confirmed, and only then posts', async ({ page }) => {
    await clearPosts(page);
    await page.getByLabel('Clear all').click();
    expect(await postTypes(page)).not.toContain('aiAudit:clear');

    await page.getByRole('button', { name: /Clear \d+ entries/ }).click();
    expect(await postTypes(page)).toContain('aiAudit:clear');
  });
});

test.describe('Audit Config', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('tab', { name: 'Audit Config' }).click();
  });

  test('every event is listed under its module', async ({ page }) => {
    await expect(page.getByText(/\d+\/\d+ active/)).toBeVisible();
    // By the group toggle rather than the chip text: the rail carries some of
    // the same words, and these labels exist only on this screen.
    for (const m of ['Providers', 'Models', 'API Keys', 'Spend Guard', 'Danger Zone']) {
      await expect(page.getByLabel(new RegExp(`^(Enable|Disable) all ${m}$`))).toBeVisible();
    }
  });

  test('a switch flips and survives a remount', async ({ page }) => {
    const row = page.getByLabel(/^Copy a provider and its models/);
    const before = await row.getAttribute('aria-pressed');
    await row.click();
    expect(await row.getAttribute('aria-pressed')).not.toBe(before);

    // Leave and come back: the choice is configuration, not view state.
    await page.getByRole('tab', { name: 'Audit Log' }).click();
    await page.getByRole('tab', { name: 'Audit Config' }).click();
    expect(await page.getByLabel(/^Copy a provider and its models/).getAttribute('aria-pressed'))
      .not.toBe(before);
  });

  test('the host is told, so it stops writing the row too', async ({ page }) => {
    await clearPosts(page);
    await page.getByLabel(/^Copy a provider and its models/).click();
    expect(await postTypes(page)).toContain('setAuditConfig');
  });

  test('Disable All empties the count, Enable All fills it', async ({ page }) => {
    await page.getByRole('button', { name: 'Disable All', exact: true }).click();
    await expect(page.getByText(/^0\/\d+ active$/)).toBeVisible();
    await page.getByRole('button', { name: 'Enable All', exact: true }).click();
    await expect(page.getByText(/^(\d+)\/\1 active$/)).toBeVisible();
  });

  test('a group collapses and stays collapsed', async ({ page }) => {
    const group = page.getByRole('button', { expanded: true }).first();
    await group.click();
    await expect(page.getByRole('button', { expanded: false }).first()).toBeVisible();
  });
});

test.describe('DB Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('tab', { name: 'DB Explorer' }).click();
  });

  test('asks the host for its tables and lists them with counts', async ({ page }) => {
    await expect(page.getByRole('button', { name: /cak_audit/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /ui_audit/ })).toBeVisible();
  });

  test('nothing is selected until you pick a table', async ({ page }) => {
    await expect(page.getByText('Select a table to browse rows')).toBeVisible();
  });

  test('picking a table loads its rows and columns', async ({ page }) => {
    await clearPosts(page);
    await page.getByRole('button', { name: /cak_audit/ }).click();
    expect(await postTypes(page)).toContain('dbExplorer:getRows');

    await expect(page.getByText(/\d+ rows/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'conversation_id' })).toBeVisible();
    expect(await page.locator('tbody tr').count()).toBeGreaterThan(0);
  });

  test('a JSON cell opens a viewer rather than overflowing the row', async ({ page }) => {
    await page.getByRole('button', { name: /cak_audit/ }).click();
    await page.getByRole('button', { name: /chars/ }).first().click();
    await expect(page.getByText('JSON Viewer')).toBeVisible();
    await page.getByLabel('Close JSON viewer').click();
    await expect(page.getByText('JSON Viewer')).toBeHidden();
  });

  test('deleting a row is confirmed and names the row', async ({ page }) => {
    await page.getByRole('button', { name: /cak_audit/ }).click();
    await clearPosts(page);
    await page.getByLabel('Delete row').first().click();
    expect(await postTypes(page)).not.toContain('dbExplorer:deleteRow');

    await expect(page.getByText(/audit_id: \d+/)).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    expect(await postTypes(page)).toContain('dbExplorer:deleteRow');
  });
});

test.describe('The screen fits the window', () => {
  test('a long list scrolls instead of running off the bottom', async ({ page }) => {
    // #root was min-height:100%, so a long screen grew the page while
    // .stage-wrap clipped it: a list with no scrollbar and no end.
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.getByRole('tab', { name: 'Audit Config' }).click();
    await page.locator('[aria-label="Enable all Providers"], [aria-label="Disable all Providers"]').first().waitFor();

    const box = await page.evaluate(() => {
      const root = document.getElementById('root')!;
      const list = [...document.querySelectorAll('div')]
        .find(e => e.className.includes('overflow-y-auto')) as HTMLElement;
      return {
        rootGrew: root.scrollHeight > root.getBoundingClientRect().height + 1,
        listScrolls: list.scrollHeight > list.getBoundingClientRect().height + 1,
      };
    });
    expect(box.rootGrew, 'the page itself must not grow past the window').toBe(false);
    expect(box.listScrolls, 'the list must be the thing that scrolls').toBe(true);
  });

  test('every tab stays inside the window', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    for (const tab of ['Audit Log', 'Audit Config', 'DB Explorer']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(200);
      const grew = await page.evaluate(() => {
        const r = document.getElementById('root')!;
        return r.scrollHeight > r.getBoundingClientRect().height + 1;
      });
      expect(grew, `${tab} grew the page`).toBe(false);
    }
  });
});

test.describe('Records are shown whole', () => {
  test('a payload wraps by default, and the toggle turns it off', async ({ page }) => {
    await page.locator('tbody tr', { hasText: 'Write a conventional commit' }).first().click();
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30_000 });

    const wrap = page.getByLabel('Wrap USER PROMPT');
    await expect(wrap).toHaveAttribute('aria-pressed', 'true');
    await wrap.click();
    await expect(wrap).toHaveAttribute('aria-pressed', 'false');
  });

  test('the whole body is rendered, not the first few thousand characters', async ({ page }) => {
    await page.locator('tbody tr', { hasText: 'Write a conventional commit' }).first().click();
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30_000 });
    // The character count beside each label is the length actually handed to
    // the editor; a clipped body would report the clip, not the record.
    await expect(page.getByText(/^\d[\d,]* chars$/).first()).toBeVisible();
    await expect(page.getByText(/truncated/)).toHaveCount(0);
  });
});
