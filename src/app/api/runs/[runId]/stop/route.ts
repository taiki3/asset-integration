import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// POST /api/runs/[runId]/stop - Stop a running or paused run
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { runId } = await context.params;
    const rId = parseInt(runId, 10);

    if (isNaN(rId)) {
      return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the run
    const [run] = await db
      .select()
      .from(runs)
      .where(eq(runs.id, rId));

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    // Only allow stopping from running or paused state
    if (run.status !== 'running' && run.status !== 'paused') {
      return NextResponse.json(
        { error: `Cannot stop run with status: ${run.status}` },
        { status: 400 }
      );
    }

    // Update to cancelled status
    const [updatedRun] = await db
      .update(runs)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        errorMessage: 'ユーザーにより停止されました',
      })
      .where(eq(runs.id, rId))
      .returning();

    return NextResponse.json(updatedRun);
  } catch (error) {
    console.error('Failed to stop run:', error);
    return NextResponse.json(
      { error: 'Failed to stop run' },
      { status: 500 }
    );
  }
}
