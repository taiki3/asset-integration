import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, runs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ id: string; runId: string }>;
}

// GET /api/projects/[id]/runs/[runId] - Get a single run
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

    // Select only necessary columns for UI (exclude heavy step outputs)
    const [run] = await db
      .select({
        id: runs.id,
        projectId: runs.projectId,
        targetSpecId: runs.targetSpecId,
        technicalAssetsId: runs.technicalAssetsId,
        jobName: runs.jobName,
        hypothesisCount: runs.hypothesisCount,
        loopCount: runs.loopCount,
        loopIndex: runs.loopIndex,
        modelChoice: runs.modelChoice,
        status: runs.status,
        currentStep: runs.currentStep,
        currentLoop: runs.currentLoop,
        progressInfo: runs.progressInfo,
        debugPrompts: runs.debugPrompts,
        errorMessage: runs.errorMessage,
        createdAt: runs.createdAt,
        updatedAt: runs.updatedAt,
        completedAt: runs.completedAt,
        // Exclude heavy columns: step*IndividualOutputs, integratedList, executionTiming, geminiInteractions
      })
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

    return NextResponse.json(run);
  } catch (error) {
    console.error('Failed to fetch run:', error);
    return NextResponse.json(
      { error: 'Failed to fetch run' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id]/runs/[runId] - Update run status
export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const [existingRun] = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.id, rId),
          eq(runs.projectId, projectId)
        )
      );

    if (!existingRun) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body;

    // Only allow certain status transitions
    const allowedTransitions: Record<string, string[]> = {
      pending: ['running', 'cancelled'],
      running: ['paused', 'completed', 'error', 'cancelled'],
      paused: ['running', 'cancelled'],
      completed: [],
      error: [],
      cancelled: [],
    };

    if (status && !allowedTransitions[existingRun.status]?.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${existingRun.status} to ${status}` },
        { status: 400 }
      );
    }

    const [updatedRun] = await db
      .update(runs)
      .set({
        status: status || existingRun.status,
        ...(status === 'completed' && { completedAt: new Date() }),
      })
      .where(eq(runs.id, rId))
      .returning();

    return NextResponse.json(updatedRun);
  } catch (error) {
    console.error('Failed to update run:', error);
    return NextResponse.json(
      { error: 'Failed to update run' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/runs/[runId] - Delete a run
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    await db.delete(runs).where(eq(runs.id, rId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete run:', error);
    return NextResponse.json(
      { error: 'Failed to delete run' },
      { status: 500 }
    );
  }
}
