import { defineConfig, devices } from '@playwright/test';

/* Drives the real screens in a real browser against the Vite dev server.
 *
 * These run in dev mode on purpose: that is where the fixture supplies data, so
 * a screen has providers, models and a ledger to act on without an extension
 * host. What the specs assert is behaviour — a control fires the right message,
 * a filter narrows the list, a destructive action asks first. */

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 20_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // The panels are dark-first and follow the editor; the dev server has no
    // editor, so pin it rather than inheriting the runner's preference.
    colorScheme: 'dark',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1500, height: 950 } } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/settings.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
