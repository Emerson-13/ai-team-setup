import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { NO_AUTH } from '../support/users';

// Public marketing pages. Install: npm i -D @axe-core/playwright
test.use({ storageState: NO_AUTH });

const PUBLIC_PAGES = ['/', '/pricing'];                                  // ADAPT

for (const path of PUBLIC_PAGES) {
  test.describe(`Public page ${path}`, () => {
    test(`AC-20: ${path} has SEO essentials @mobile`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(/.{10,}/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{50,}/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\//);
      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveCount(1);
    });

    test(`AC-21: ${path} has no critical or serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toEqual([]);
    });
  });
}
