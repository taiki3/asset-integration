import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, runs, hypotheses } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ id: string; runId: string }>;
}

// GET /api/projects/[id]/runs/[runId]/hypotheses - List hypotheses for a run
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id, runId } = await context.params;
    const projectId = parseInt(id, 10);
    const rId = parseInt(runId, 10);

    if (isNaN(projectId) || isNaN(rId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify project ownership
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, user.id),
          isNull(projects.deletedAt)
        )
      );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify run exists
    const [run] = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.id, rId),
          eq(runs.projectId, projectId)
        )
      );

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    // Get hypotheses
    const runHypotheses = await db
      .select()
      .from(hypotheses)
      .where(eq(hypotheses.runId, rId))
      .orderBy(asc(hypotheses.hypothesisNumber));

    return NextResponse.json(runHypotheses);
  } catch (error) {
    console.error('Failed to fetch hypotheses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hypotheses' },
      { status: 500 }
    );
  }
}
