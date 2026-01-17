/**
 * Debug endpoint to check environment variables (temporary)
 */

import { NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/utils/get-base-url';

export async function GET() {
  return NextResponse.json({
    VERCEL_URL: process.env.VERCEL_URL || '(not set)',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '(not set)',
    computedBaseUrl: getBaseUrl(),
    CRON_SECRET_SET: !!process.env.CRON_SECRET,
    VERCEL_AUTOMATION_BYPASS_SECRET_SET: !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV || '(not set)',
  });
}
