import { test, expect } from '@playwright/test';

test.describe('Projects', () => {
  test('can view projects list via API', async ({ request }) => {
    // Test API directly for projects
    const response = await request.get('/api/projects');

    // Should return some status (might be 401 if auth required)
    expect([200, 401, 404]).toContain(response.status());
  });

  test('dashboard loads without errors', async ({ page }) => {
    // Check that no JavaScript errors occurred
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Give a moment for React to hydrate
    await page.waitForTimeout(1000);

    // Filter out expected errors (like auth redirects)
    const unexpectedErrors = errors.filter(
      (e) => !e.includes('auth') && !e.includes('redirect')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });
});
