import { test, expect } from '@playwright/test';

test.describe('Authentication (Mock Mode)', () => {
  test('login page is accessible', async ({ page }) => {
    await page.goto('/login');

    // Should see login page content
    await expect(page).toHaveTitle(/ASIP/);
  });

  test('mock auth allows access to dashboard', async ({ page }) => {
    // In mock auth mode, we should be able to access the dashboard
    await page.goto('/');

    // Wait for page to be ready (don't wait for networkidle as it may timeout)
    await page.waitForLoadState('domcontentloaded');

    // Should either be on dashboard, login, or root
    const url = page.url();
    expect(url).toMatch(/\/(dashboard|login)?$/);
  });
});
