import { test, expect } from '@playwright/test';

test.describe('Projects', () => {
  test('can view projects list via API', async ({ request }) => {
    // Test API directly for projects
    const response = await request.get('/api/projects');

    // With mock auth, should return 200 with projects
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('dashboard shows seeded projects', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Wait for React hydration and data loading
    await page.waitForTimeout(2000);

    // Should show the seeded project titles
    const content = await page.content();
    expect(content).toContain('E2E Test Project');
  });

  test('dashboard loads without errors', async ({ page }) => {
    // Check that no JavaScript errors occurred
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/dashboard');
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
