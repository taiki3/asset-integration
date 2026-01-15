import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { runs, projects } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// GET /api/runs/[runId] - Get a single run by ID
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

    // Find the run and verify user has access via project
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

    return NextResponse.json(run);
  } catch (error) {
    console.error('Failed to fetch run:', error);
    return NextResponse.json(
      { error: 'Failed to fetch run' },
      { status: 500 }
    );
  }
}
