import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Generic smoke tests that work on a fresh app. They prove the server, database, and browser are wired up.
// ADAPT the paths to your public pages; add the real journeys in their own specs.
const PUBLIC_PAGES = ['/'];

for (const path of PUBLIC_PAGES) {
  test.describe(`Smoke ${path}`, () => {
    test('loads without server errors or console errors @mobile', async ({ page }) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        // A missing favicon is not an app error; every other console error is.
        if (message.type() === 'error' && !/favicon\.ico/.test(message.location().url)) {
          problems.push(`console: ${message.text()} (${message.location().url})`);
        }
      });

      const response = await page.goto(path);
      expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);
      await expect(page.locator('body')).toBeVisible();
      expect(problems).toEqual([]);
    });

    test('has no critical or serious accessibility violations', async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toEqual([]);
    });
  });
}

test('an unknown page returns 404, not a crash', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist-e2e');
  expect(response?.status()).toBe(404);
});
