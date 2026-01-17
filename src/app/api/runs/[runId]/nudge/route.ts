/**
 * Nudge Run API
 *
 * Client-callable endpoint to nudge a stuck run forward.
 * Uses session authentication and internally calls the process endpoint.
 * Acts as a fallback when after() chain breaks in serverless environments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { runs, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getBaseUrl, getInternalApiHeaders } from '@/lib/utils/get-base-url';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// POST /api/runs/[runId]/nudge - Nudge a run to continue processing
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { runId: runIdStr } = await context.params;
    const runId = parseInt(runIdStr, 10);

    if (isNaN(runId)) {
      return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
    }

    // Verify run exists and user owns the project
    const [run] = await db
      .select({
        id: runs.id,
        status: runs.status,
        projectId: runs.projectId,
      })
      .from(runs)
      .where(eq(runs.id, runId));

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    // Verify project ownership
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, run.projectId),
          eq(projects.userId, user.id)
        )
      );

    if (!project) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Only nudge running runs
    if (run.status !== 'running') {
      return NextResponse.json({
        message: 'Run is not in running state',
        status: run.status
      });
    }

    // Call the process endpoint internally
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[Nudge] CRON_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/runs/${runId}/process`, {
      method: 'POST',
      headers: getInternalApiHeaders(cronSecret),
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      console.error('[Nudge] Blocked by Vercel Protection');
      return NextResponse.json({ error: 'Blocked by deployment protection' }, { status: 503 });
    }

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Nudge] Process API error: ${response.status} - ${body}`);
      return NextResponse.json({ error: 'Process failed' }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json({
      nudged: true,
      phase: result.phase,
      hasMore: result.hasMore,
    });

  } catch (error) {
    console.error('[Nudge] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
