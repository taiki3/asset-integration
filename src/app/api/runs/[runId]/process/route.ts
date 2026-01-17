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

    const result = await executeNextStep(deps, runId);

    console.log(`[Process] Step result for run ${runId}:`, result);

    // If there are more steps, schedule the next one
    if (result.hasMore) {
      const baseUrl = getBaseUrl();

      after(async () => {
        const maxRetries = 3;
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[Process] Scheduling next step for run ${runId} (attempt ${attempt}/${maxRetries})`);

            // Use AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(`${baseUrl}/api/runs/${runId}/process`, {
              method: 'POST',
              headers: getInternalApiHeaders(expectedSecret),
              redirect: 'manual',
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Check for redirect (Vercel Protection)
            if (response.status >= 300 && response.status < 400) {
              console.error(`[Process] Blocked by Vercel Protection - redirected to: ${response.headers.get('location')}`);
              // Don't retry for protection issues
              return;
            }

            if (!response.ok) {
              const body = await response.text();
              console.error(`[Process] API error: ${response.status} - ${body}`);
              lastError = new Error(`API error: ${response.status}`);
              // Retry on server errors
              if (response.status >= 500 && attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
              }
            } else {
              console.log(`[Process] Next step scheduled successfully`);
              return; // Success, exit retry loop
            }
          } catch (error) {
            lastError = error;
            console.error(`[Process] Attempt ${attempt} failed for run ${runId}:`, error);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
          }
        }

        console.error(`[Process] All ${maxRetries} attempts failed for run ${runId}:`, lastError);
      });
    }

    return NextResponse.json({
      runId,
      phase: result.phase,
      hasMore: result.hasMore,
      error: result.error,
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
