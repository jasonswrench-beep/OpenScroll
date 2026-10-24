import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('shell connects, offers keyboard skip navigation, and passes baseline scan', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#connection-status')).toHaveText('Connected. The authoring service and database are ready.');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('unavailable service has a recoverable error state', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.goto('/');
  await expect(page.locator('#connection-status')).toContainText('unavailable');
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.locator('#connection-status')).toContainText('Connected.');
});
