/**
 * Process Run Step API
 *
 * This endpoint executes the next step in a pipeline run.
 * It's designed to be called:
 * 1. Via after() for self-chaining during active execution
 * 2. Via cron for recovery of stuck runs
 *
 * Authentication: CRON_SECRET header (internal use only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { executeNextStep } from '@/lib/asip/step-executor';
import { createDatabaseAdapter } from '@/lib/asip/db-adapter';
import { createAIAdapter } from '@/lib/asip/ai-adapter';
import { getBaseUrl, getInternalApiHeaders } from '@/lib/utils/get-base-url';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// POST /api/runs/[runId]/process - Execute next pipeline step
export async function POST(request: NextRequest, context: RouteContext) {
  console.log('[Process] === ENDPOINT HIT ===');

  const { runId: runIdStr } = await context.params;
  const runId = parseInt(runIdStr, 10);

  console.log(`[Process] runId=${runId}, CRON_SECRET env set: ${!!process.env.CRON_SECRET}`);

  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  // Verify internal auth (CRON_SECRET)
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  console.log(`[Process] Auth check - expected set: ${!!expectedSecret}, received set: ${!!cronSecret}, match: ${cronSecret === expectedSecret}`);

  if (!expectedSecret || cronSecret !== expectedSecret) {
    console.log(`[Process] Auth failed - expectedSecret length: ${expectedSecret?.length || 0}, cronSecret length: ${cronSecret?.length || 0}`);
    return NextResponse.json({
      error: 'Unauthorized',
      debug: {
        expectedSecretSet: !!expectedSecret,
        expectedSecretLength: expectedSecret?.length || 0,
        receivedSecretSet: !!cronSecret,
        receivedSecretLength: cronSecret?.length || 0,
        match: cronSecret === expectedSecret,
      }
    }, { status: 401 });
  }

  try {
    // Import proxy setup before AI calls
    await import('@/lib/gemini/proxy-setup');

    const deps = {
      db: createDatabaseAdapter(),
      ai: createAIAdapter(),
      logger: {
        log: (message: string) => console.log(`[Process ${runId}] ${message}`),
        error: (message: string, error?: unknown) => console.error(`[Process ${runId}] ${message}`, error),
        warn: (message: string) => console.warn(`[Process ${runId}] ${message}`),
      },
    };

    console.log(`[Process] Starting step execution for run ${runId}`);

    // Execute steps in a loop to reduce after() dependency
    // Time budget: 50 seconds (Vercel timeout is 60s for Pro)
    const startTime = Date.now();
    const TIME_BUDGET_MS = 50000;
    const MAX_ITERATIONS = 20; // Safety limit

    let result = await executeNextStep(deps, runId);
    let iterations = 1;

    console.log(`[Process] Step ${iterations} result for run ${runId}: phase=${result.phase}, hasMore=${result.hasMore}`);

    // Continue executing steps while:
    // - There are more steps
    // - We have time budget remaining
    // - We haven't hit the safety limit
    // - The phase is a "quick" phase (polling, status updates)
    const quickPhases = ['step2_1_polling', 'step2_2_polling', 'evaluation', 'step2_1_5'];

    while (
      result.hasMore &&
      iterations < MAX_ITERATIONS &&
      (Date.now() - startTime) < TIME_BUDGET_MS &&
      quickPhases.includes(result.phase)
    ) {
      iterations++;
      console.log(`[Process] Continuing to step ${iterations} for run ${runId} (elapsed: ${Date.now() - startTime}ms)`);

      result = await executeNextStep(deps, runId);
      console.log(`[Process] Step ${iterations} result: phase=${result.phase}, hasMore=${result.hasMore}`);
    }

    console.log(`[Process] Finished after ${iterations} iterations, elapsed: ${Date.now() - startTime}ms`);

    // If there are more steps and we stopped due to time/phase, schedule via after()
    if (result.hasMore) {
      const baseUrl = getBaseUrl();
      const reason = (Date.now() - startTime) >= TIME_BUDGET_MS ? 'time' :
                     iterations >= MAX_ITERATIONS ? 'iterations' : 'slow_phase';

      console.log(`[Process] Scheduling next step via after() (reason: ${reason})`);

      after(async () => {
        try {
          console.log(`[Process] after() executing for run ${runId}`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          const response = await fetch(`${baseUrl}/api/runs/${runId}/process`, {
            method: 'POST',
            headers: getInternalApiHeaders(expectedSecret),
            redirect: 'manual',
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.status >= 300 && response.status < 400) {
            console.error(`[Process] Blocked by Vercel Protection`);
            return;
          }

          if (!response.ok) {
            const body = await response.text();
            console.error(`[Process] after() API error: ${response.status} - ${body}`);
          } else {
            console.log(`[Process] after() succeeded for run ${runId}`);
          }
        } catch (error) {
          console.error(`[Process] after() failed for run ${runId}:`, error);
        }
      });
    }

    return NextResponse.json({
      runId,
      phase: result.phase,
      hasMore: result.hasMore,
      error: result.error,
      iterations,
      elapsedMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error(`[Process] Error processing run ${runId}:`, error);
    return NextResponse.json(
      {
        error: 'Failed to process run step',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
