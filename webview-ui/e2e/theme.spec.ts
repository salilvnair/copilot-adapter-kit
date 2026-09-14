/* Both themes have to be legible, not just the dark one.
 *
 * A light panel once rendered its secondary buttons as black blocks: dui
 * declares `--color-btn-secondary-bg` as an alias on :root, and an alias
 * resolves where it is declared, so with the theme class only on <body> those
 * buttons kept the dark value while the surface around them went light.
 *
 * These assert contrast rather than exact colours, so a palette change does not
 * break them — only an unreadable control does. */

import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers';

/** Relative luminance, per WCAG. */
function luminance([r, g, b]: number[]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const rgb = (s: string): number[] =>
  (s.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);

async function buttonColours(page: Page) {
  return page.locator('.dui_button').evaluateAll(els =>
    els.map(el => {
      const cs = getComputedStyle(el);
      return { label: (el.textContent || '').trim().slice(0, 20), bg: cs.backgroundColor, fg: cs.color };
    }));
}

for (const theme of ['dark', 'light'] as const) {
  test(`every button is legible on a ${theme} editor theme`, async ({ page }) => {
    await page.goto('/settings.html');
    await ready(page);

    if (theme === 'light') {
      // Exactly what VS Code does.
      await page.evaluate(() => document.body.classList.add('vscode-light'));
      await page.waitForTimeout(400);
      await expect(page.locator('html')).toHaveClass(/vscode-light/);
    }

    const buttons = await buttonColours(page);
    expect(buttons.length).toBeGreaterThan(0);

    for (const b of buttons) {
      const ratio = contrast(rgb(b.bg), rgb(b.fg));
      expect(ratio, `"${b.label}" on ${theme}: ${b.fg} on ${b.bg}`).toBeGreaterThan(2.5);
    }
  });
}

test('a light theme does not leave dark surfaces behind', async ({ page }) => {
  await page.goto('/settings.html');
  await ready(page);
  await page.evaluate(() => document.body.classList.add('vscode-light'));
  await page.waitForTimeout(400);

  // Every button surface should be a light one. This is the specific failure:
  // secondary buttons stayed at dui's dark #2a2d2e on a white panel.
  const buttons = await buttonColours(page);
  for (const b of buttons) {
    const l = luminance(rgb(b.bg));
    const isAccent = l < 0.25 && /provider|commit|save|remove/i.test(b.label);
    if (isAccent) continue; // primary and danger are meant to be strong
    expect(l, `"${b.label}" surface ${b.bg} is too dark for a light theme`).toBeGreaterThan(0.25);
  }
});

test('the panel follows the editor back to dark', async ({ page }) => {
  await page.goto('/settings.html');
  await ready(page);
  await page.evaluate(() => document.body.classList.add('vscode-light'));
  await expect(page.locator('html')).toHaveClass(/vscode-light/);
  await page.evaluate(() => document.body.classList.remove('vscode-light'));
  await expect(page.locator('html')).not.toHaveClass(/vscode-light/);
});

test('the theme button cycles auto, light, dark and remembers the choice', async ({ page }) => {
  await page.goto('/settings.html');
  await ready(page);

  const button = page.locator('.set-top button[aria-label^="Theme:"]');
  await expect(button).toHaveAttribute('aria-label', /following the editor/);
  const startedDark = await page.locator('html').evaluate(el => !el.classList.contains('is-light'));
  expect(startedDark).toBe(true);

  await button.click();                                   // auto → light
  await expect(button).toHaveAttribute('aria-label', /Theme: light/);
  await expect(page.locator('html')).toHaveClass(/is-light/);

  await button.click();                                   // light → dark
  await expect(button).toHaveAttribute('aria-label', /Theme: dark/);
  await expect(page.locator('html')).not.toHaveClass(/is-light/);

  // The choice survives a reload.
  await page.reload();
  await ready(page);
  await expect(page.locator('.set-top button[aria-label^="Theme:"]'))
    .toHaveAttribute('aria-label', /Theme: dark/);

  await page.locator('.set-top button[aria-label^="Theme:"]').click();  // dark → auto
  await expect(page.locator('.set-top button[aria-label^="Theme:"]'))
    .toHaveAttribute('aria-label', /following the editor/);
});

test('an explicit light choice beats a dark editor', async ({ page }) => {
  await page.goto('/settings.html');
  await ready(page);
  await page.locator('.set-top button[aria-label^="Theme:"]').click();   // light
  await expect(page.locator('html')).toHaveClass(/is-light/);

  // The editor stays dark; the explicit choice must win.
  await page.evaluate(() => document.body.classList.remove('vscode-light'));
  await page.waitForTimeout(200);
  await expect(page.locator('html')).toHaveClass(/is-light/);
});
