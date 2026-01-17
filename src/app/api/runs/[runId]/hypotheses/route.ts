import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { runs, projects, hypotheses } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// GET /api/runs/[runId]/hypotheses - Get all hypotheses for a run
export async function GET(request: NextRequest, context: RouteContext) {
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

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, run.projectId),
          eq(projects.userId, user.id),
          isNull(projects.deletedAt)
        )
      );

    if (!project) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get hypotheses for this run (light columns for list view)
    // Exclude heavy columns: step2_2Output, step3Output, step4Output, step5Output, fullData
    const runHypotheses = await db
      .select({
        id: hypotheses.id,
        uuid: hypotheses.uuid,
        projectId: hypotheses.projectId,
        runId: hypotheses.runId,
        hypothesisNumber: hypotheses.hypothesisNumber,
        indexInRun: hypotheses.indexInRun,
        displayTitle: hypotheses.displayTitle,
        contentHash: hypotheses.contentHash,
        step2_1Summary: hypotheses.step2_1Summary, // Keep summary for sidebar display
        processingStatus: hypotheses.processingStatus,
        currentInteractionId: hypotheses.currentInteractionId,
        errorMessage: hypotheses.errorMessage,
        createdAt: hypotheses.createdAt,
        deletedAt: hypotheses.deletedAt,
      })
      .from(hypotheses)
      .where(
        and(
          eq(hypotheses.runId, rId),
          isNull(hypotheses.deletedAt)
        )
      )
      .orderBy(hypotheses.hypothesisNumber);

    return NextResponse.json(runHypotheses);
  } catch (error) {
    console.error('Failed to fetch hypotheses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hypotheses' },
      { status: 500 }
    );
  }
}
