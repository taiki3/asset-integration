/**
 * Cron Watchdog for Stuck Runs
 *
 * This endpoint is called periodically by Vercel Cron to:
 * 1. Find runs that are stuck in 'running' status
 * 2. Resume their execution by calling the process endpoint
 *
 * A run is considered stuck if:
 * - Status is 'running' or 'pending'
 * - updatedAt is older than 5 minutes
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { and, eq, lt, or } from 'drizzle-orm';
import { getBaseUrl, getInternalApiHeaders } from '@/lib/utils/get-base-url';

// GET /api/cron/process-runs - Find and resume stuck runs
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = getBaseUrl();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  try {
    // Find stuck runs
    const stuckRuns = await db
      .select({ id: runs.id, status: runs.status, updatedAt: runs.updatedAt })
      .from(runs)
      .where(
        and(
          or(eq(runs.status, 'running'), eq(runs.status, 'pending')),
          lt(runs.updatedAt, fiveMinutesAgo)
        )
      );

    console.log(`[Cron] Found ${stuckRuns.length} stuck runs`);

    const results: Array<{ runId: number; status: string; resumed: boolean; error?: string }> = [];

    // Resume each stuck run
    for (const run of stuckRuns) {
      try {
        console.log(`[Cron] Resuming stuck run ${run.id} (status: ${run.status}, updatedAt: ${run.updatedAt})`);

        const response = await fetch(`${baseUrl}/api/runs/${run.id}/process`, {
          method: 'POST',
          headers: getInternalApiHeaders(cronSecret),
        });

        if (response.ok) {
          results.push({ runId: run.id, status: run.status, resumed: true });
        } else {
          const errorText = await response.text();
          results.push({ runId: run.id, status: run.status, resumed: false, error: errorText });
        }
      } catch (error) {
        console.error(`[Cron] Failed to resume run ${run.id}:`, error);
        results.push({
          runId: run.id,
          status: run.status,
          resumed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      checked: stuckRuns.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Error checking stuck runs:', error);
    return NextResponse.json(
      { error: 'Failed to check stuck runs' },
      { status: 500 }
    );
  }
}
