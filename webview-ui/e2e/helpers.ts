/* Shared helpers for the end-to-end specs. */

import type { Page } from '@playwright/test';

export interface Posted { type: string; payload?: unknown }

/**
 * Start recording the messages the webview sends to the extension host.
 *
 * There is no host on the dev server, so `post()` mirrors every call as a
 * `cak:post` DOM event (dev builds only). Recording those is how a spec proves
 * a control is wired rather than merely present — the exact failure that let a
 * menu render perfectly and do nothing.
 */
export async function recordPosts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__posts = [];
    window.addEventListener('cak:post', (e: Event) => {
      (window as any).__posts.push((e as CustomEvent).detail);
    });
  });
}

export async function posts(page: Page): Promise<Posted[]> {
  return page.evaluate(() => (window as any).__posts as Posted[]);
}

export async function postTypes(page: Page): Promise<string[]> {
  return (await posts(page)).map(p => p.type);
}

export async function clearPosts(page: Page): Promise<void> {
  await page.evaluate(() => { (window as any).__posts = []; });
}

/** Open a settings screen from the rail and wait for it to be the current one. */
export async function goTo(page: Page, name: string): Promise<void> {
  await page.locator('.rail-item', { hasText: name }).first().click();
  await page.locator('.set-main, .sg').first().waitFor();
}

/** Wait until the fixture has populated the screen. */
export async function ready(page: Page): Promise<void> {
  await page.locator('.set-top').waitFor();
  await page.locator('.prov, .set-main').first().waitFor();
}
