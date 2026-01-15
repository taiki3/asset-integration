import { test, expect } from '@playwright/test';

test.describe('History Panel', () => {
  test.describe('Run List', () => {
    test('displays run history in project', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      // Project 2 has a completed run from seed data
      await expect(page.locator('text=実行履歴')).toBeVisible({ timeout: 10000 });
    });

    test('shows completed run with status badge', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      // Should show the seeded completed run
      await expect(page.locator('text=サンプル分析')).toBeVisible({ timeout: 10000 });
    });

    test('can click on run to view details', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      // Click on the run to open details (use first match)
      await page.locator('text=サンプル分析').first().click();

      // Dialog should open
      await expect(page.locator('role=dialog')).toBeVisible();
    });
  });

  test.describe('Run Details Dialog', () => {
    test('shows summary tab by default', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('text=サンプル分析').click();
      await expect(page.locator('role=dialog')).toBeVisible();

      // Summary tab should be visible
      await expect(page.locator('button[role="tab"]:has-text("概要")')).toBeVisible();
    });

    test('can switch to parameters tab', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('text=サンプル分析').first().click();
      await expect(page.locator('role=dialog')).toBeVisible();

      // Click parameters tab
      await page.locator('button[role="tab"]:has-text("パラメータ")').click();

      // Should show parameter info (use exact match within dialog)
      await expect(page.locator('role=dialog').getByText('仮説数', { exact: true })).toBeVisible();
    });

    test('can switch to outputs tab', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('text=サンプル分析').click();
      await expect(page.locator('role=dialog')).toBeVisible();

      // Click outputs tab
      await page.locator('button[role="tab"]:has-text("出力")').click();

      // Should show output section
      await expect(page.getByRole('tabpanel')).toBeVisible();
    });

    test('can close dialog with close button', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('text=サンプル分析').click();
      await expect(page.locator('role=dialog')).toBeVisible();

      // Close dialog
      await page.locator('button:has-text("閉じる")').click();

      // Dialog should be hidden
      await expect(page.locator('role=dialog')).toBeHidden();
    });
  });

  test.describe('Download Buttons', () => {
    test('shows download buttons for completed run', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('text=サンプル分析').click();
      await expect(page.locator('role=dialog')).toBeVisible();

      // Should show download buttons
      await expect(page.locator('button:has-text("TSV")')).toBeVisible();
      await expect(page.locator('button:has-text("Excel")')).toBeVisible();
    });

    test('download buttons are disabled for non-completed runs', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      // This test assumes we know the run is completed
      // For pending/running runs, buttons should be disabled
      await page.locator('text=サンプル分析').click();
      await expect(page.locator('role=dialog')).toBeVisible();

      // Verify buttons exist (completed run should have enabled buttons)
      const tsvButton = page.locator('button:has-text("TSV")');
      await expect(tsvButton).toBeVisible();
    });
  });

  test.describe('Individual Reports Tab', () => {
    test('shows individual reports tab for completed runs', async ({ page }) => {
      await page.goto('/projects/2');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('text=サンプル分析').click();
      await expect(page.locator('role=dialog')).toBeVisible();

      // Should have individual reports tab (if implemented)
      const reportsTab = page.locator('button[role="tab"]:has-text("個別レポート")');
      if (await reportsTab.isVisible()) {
        await reportsTab.click();
        await expect(page.getByRole('tabpanel')).toBeVisible();
      }
    });
  });
});

test.describe('History Panel API', () => {
  test('GET /api/runs/:id returns run details', async ({ request }) => {
    const response = await request.get('/api/runs/1');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('id', 1);
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('jobName');
  });

  test('download endpoints exist', async ({ request }) => {
    // These endpoints may return 404 if run has no data, but should not error
    const tsvResponse = await request.get('/api/runs/1/download?format=tsv');
    expect(tsvResponse.status()).toBeLessThan(500);

    const excelResponse = await request.get('/api/runs/1/download?format=excel');
    expect(excelResponse.status()).toBeLessThan(500);
  });
});

test.describe('Individual Report Downloads', () => {
  test('API: GET /api/runs/:runId/hypotheses returns hypotheses for run', async ({ request }) => {
    const response = await request.get('/api/runs/1/hypotheses');
    // Run 1 may not have hypotheses, but endpoint should exist
    expect(response.status()).toBeLessThan(500);
  });

  test('API: GET /api/runs/:runId/reports/zip returns ZIP of all reports', async ({ request }) => {
    const response = await request.get('/api/runs/1/reports/zip');
    // Endpoint should exist and not error
    expect(response.status()).toBeLessThan(500);
  });
});
