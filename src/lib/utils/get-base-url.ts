/**
 * Get the base URL for internal API calls
 *
 * Priority:
 * 1. VERCEL_URL (automatically set by Vercel)
 * 2. NEXT_PUBLIC_APP_URL (manual override)
 * 3. localhost:3000 (local development)
 */
export function getBaseUrl(): string {
  // Vercel automatically sets VERCEL_URL for all deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Manual override (useful for custom domains)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Local development fallback
  return 'http://localhost:3000';
}

/**
 * Get headers for internal API calls that bypass Vercel Deployment Protection
 */
export function getInternalApiHeaders(cronSecret: string): Record<string, string> {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  console.log(`[getInternalApiHeaders] VERCEL_AUTOMATION_BYPASS_SECRET set: ${!!bypassSecret}, length: ${bypassSecret?.length || 0}`);

  const headers: Record<string, string> = {
    'x-cron-secret': cronSecret,
    'Content-Type': 'application/json',
  };

  // Add bypass header for Vercel Deployment Protection (Preview deployments)
  if (bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret;
  }

  return headers;
}
