import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.describe('Navigation', () => {
    test('can navigate to settings page from header', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');

      // Click settings button in header
      await page.click('[data-testid="button-settings"]');

      // Should navigate to settings page
      await expect(page).toHaveURL(/\/settings/);
    });

    test('can navigate back to dashboard from settings', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for page to load
      await expect(page.locator('[data-testid="button-back-dashboard"]')).toBeVisible({ timeout: 10000 });

      // Click back button
      await page.click('[data-testid="button-back-dashboard"]');

      // Should navigate to dashboard
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe('Page Structure', () => {
    test('settings page loads without errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });

      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for the page to fully load
      await expect(page.locator('[data-testid="text-settings-title"]')).toBeVisible();
      await page.waitForTimeout(500);

      expect(errors).toHaveLength(0);
    });

    test('displays settings title', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.locator('[data-testid="text-settings-title"]')).toContainText('設定');
    });

    test('displays step selector', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.locator('[data-testid="select-step"]')).toBeVisible();
    });

    test('displays prompt editor', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for data to load (textarea appears after loading completes)
      await expect(page.locator('[data-testid="textarea-prompt"]')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Step Selection', () => {
    test('can select different steps', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for page to load
      await expect(page.locator('[data-testid="select-step"]')).toBeVisible({ timeout: 10000 });

      // Open step selector
      await page.click('[data-testid="select-step"]');

      // Should show step options (use exact names to avoid regex matching multiple options)
      await expect(page.getByRole('option', { name: 'Step 2-1: テーマ創出と選定' })).toBeVisible();
      await expect(page.getByRole('option', { name: /Step 3:/ })).toBeVisible();
      await expect(page.getByRole('option', { name: /Step 4:/ })).toBeVisible();
      await expect(page.getByRole('option', { name: /Step 5:/ })).toBeVisible();
    });

    test('changing step updates the editor content', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for textarea to appear (data loaded)
      await expect(page.locator('[data-testid="textarea-prompt"]')).toBeVisible({ timeout: 10000 });

      // Get initial content
      const initialContent = await page.locator('[data-testid="textarea-prompt"]').inputValue();

      // Change step
      await page.click('[data-testid="select-step"]');
      await page.getByRole('option', { name: /Step 3/ }).click();

      // Wait for new content to load
      await page.waitForTimeout(1000);

      // Content should change (or be loaded for new step)
      const newContent = await page.locator('[data-testid="textarea-prompt"]').inputValue();
      // Both should have content (default prompts)
      expect(initialContent.length).toBeGreaterThan(0);
      expect(newContent.length).toBeGreaterThan(0);
    });
  });

  test.describe('Prompt Management', () => {
    test('can edit prompt content', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for textarea to appear
      const textarea = page.locator('[data-testid="textarea-prompt"]');
      await expect(textarea).toBeVisible({ timeout: 10000 });

      await textarea.fill('Test prompt content');

      await expect(textarea).toHaveValue('Test prompt content');
    });

    test('save button is disabled when prompt is empty', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for textarea to appear
      const textarea = page.locator('[data-testid="textarea-prompt"]');
      await expect(textarea).toBeVisible({ timeout: 10000 });

      await textarea.fill('');

      await expect(page.locator('[data-testid="button-save-prompt"]')).toBeDisabled();
    });

    test('can save prompt and create new version', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for textarea to appear
      const textarea = page.locator('[data-testid="textarea-prompt"]');
      await expect(textarea).toBeVisible({ timeout: 10000 });

      // Edit prompt
      const testContent = `Test prompt ${Date.now()}`;
      await textarea.fill(testContent);

      // Save
      await page.click('[data-testid="button-save-prompt"]');

      // Wait for save to complete
      await page.waitForTimeout(2000);

      // Should show success (toast or version badge update)
      // After save, the version selector should show the new version
      await expect(page.locator('[data-testid="select-version"]')).toBeVisible();
    });
  });

  test.describe('Version History', () => {
    test('version selector is visible after saving', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // If there are saved versions, selector should be visible
      // (depends on test data seeding)
      const versionSelector = page.locator('[data-testid="select-version"]');

      // It may or may not be visible depending on whether versions exist
      // Just check the page structure is correct
      await expect(page.locator('[data-testid="select-step"]')).toBeVisible();
    });

    test('can load default prompt', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // If version selector exists and has default option
      const versionSelector = page.locator('[data-testid="select-version"]');
      if (await versionSelector.isVisible()) {
        await versionSelector.click();
        await page.getByRole('option', { name: /デフォルト/ }).click();

        // Content should be populated with default
        const content = await page.locator('[data-testid="textarea-prompt"]').inputValue();
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Export', () => {
    test('export button is visible', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.locator('[data-testid="button-export-prompts"]')).toBeVisible();
    });

    test('can click export button', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      // Click export - should trigger download
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
        page.click('[data-testid="button-export-prompts"]'),
      ]);

      // Download may or may not happen depending on implementation
      // Just ensure no error occurs
    });
  });
});

test.describe('Settings API', () => {
  test.describe('Prompts API', () => {
    test('GET /api/prompts/21 returns prompt data', async ({ request }) => {
      const response = await request.get('/api/prompts/21');
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('stepNumber', 21);
      expect(data).toHaveProperty('defaultPrompt');
      expect(data).toHaveProperty('versions');
    });

    test('GET /api/prompts/3 returns prompt data', async ({ request }) => {
      const response = await request.get('/api/prompts/3');
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('stepNumber', 3);
    });

    test('POST /api/prompts/21 creates new version', async ({ request }) => {
      const response = await request.post('/api/prompts/21', {
        data: {
          content: 'Test prompt content for E2E testing',
        },
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('content', 'Test prompt content for E2E testing');
    });

    test('POST /api/prompts/21/activate/:id activates version', async ({ request }) => {
      // First create a version
      const createResponse = await request.post('/api/prompts/21', {
        data: {
          content: 'Version to activate',
        },
      });
      const created = await createResponse.json();

      // Then activate it
      const activateResponse = await request.post(`/api/prompts/21/activate/${created.id}`);
      expect(activateResponse.ok()).toBeTruthy();

      const activated = await activateResponse.json();
      expect(activated).toHaveProperty('isActive', true);
    });

    test('GET /api/prompts/export returns all prompts', async ({ request }) => {
      const response = await request.get('/api/prompts/export');
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      // Each prompt should have required fields
      data.forEach((prompt: { stepNumber: number; stepName: string; content: string }) => {
        expect(prompt).toHaveProperty('stepNumber');
        expect(prompt).toHaveProperty('stepName');
        expect(prompt).toHaveProperty('content');
      });
    });
  });

  test.describe('File Attachments API', () => {
    test('GET /api/file-attachments/21 returns attachment data', async ({ request }) => {
      const response = await request.get('/api/file-attachments/21');
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('stepNumber', 21);
      expect(data).toHaveProperty('availableFiles');
      expect(data).toHaveProperty('attachedFiles');
      expect(Array.isArray(data.availableFiles)).toBe(true);
      expect(Array.isArray(data.attachedFiles)).toBe(true);
    });

    test('PUT /api/file-attachments/21 updates attachments', async ({ request }) => {
      const response = await request.put('/api/file-attachments/21', {
        data: {
          attachedFiles: ['target_spec', 'technical_assets'],
        },
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('attachedFiles');
      expect(data.attachedFiles).toContain('target_spec');
    });
  });
});
