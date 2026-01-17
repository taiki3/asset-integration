import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, runs, hypotheses } from '@/lib/db/schema';
import { eq, and, isNull, inArray, desc } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/hypotheses - List all hypotheses for a project
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const projectId = parseInt(id, 10);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
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

    // Get all runs for this project
    const projectRuns = await db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.projectId, projectId));

    if (projectRuns.length === 0) {
      return NextResponse.json([]);
    }

    const runIds = projectRuns.map((r) => r.id);

    // Get all hypotheses for all runs in this project
    const projectHypotheses = await db
      .select()
      .from(hypotheses)
      .where(inArray(hypotheses.runId, runIds))
      .orderBy(desc(hypotheses.createdAt));

    return NextResponse.json(projectHypotheses);
  } catch (error) {
    console.error('Failed to fetch project hypotheses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hypotheses' },
      { status: 500 }
    );
  }
}
