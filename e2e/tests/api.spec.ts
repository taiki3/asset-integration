import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
  test('health endpoint works', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
  });

  test('unknown API returns 404', async ({ request }) => {
    const response = await request.get('/api/nonexistent');
    expect(response.status()).toBe(404);
  });

  test('API returns JSON content type', async ({ request }) => {
    const response = await request.get('/api/health');
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });
});
