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
