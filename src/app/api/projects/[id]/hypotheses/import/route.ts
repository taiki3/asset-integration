import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, hypotheses } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ImportHypothesis {
  hypothesisNumber?: number;
  displayTitle?: string;
  step2_1Summary?: string;
}

// POST /api/projects/[id]/hypotheses/import - Import hypotheses from CSV
export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = await request.json();
    const { hypotheses: importData } = body as { hypotheses: ImportHypothesis[] };

    if (!importData || !Array.isArray(importData) || importData.length === 0) {
      return NextResponse.json(
        { error: 'No hypotheses data provided' },
        { status: 400 }
      );
    }

    // Find the max hypothesis number in this project
    const existingHypotheses = await db
      .select()
      .from(hypotheses)
      .where(
        and(
          eq(hypotheses.projectId, projectId),
          isNull(hypotheses.deletedAt)
        )
      );

    const maxNumber = existingHypotheses.reduce(
      (max, h) => Math.max(max, h.hypothesisNumber),
      0
    );

    // Create hypotheses
    const createdHypotheses = [];
    for (let i = 0; i < importData.length; i++) {
      const data = importData[i];
      const hypothesisNumber = data.hypothesisNumber || maxNumber + i + 1;

      const [created] = await db
        .insert(hypotheses)
        .values({
          uuid: uuidv4(),
          projectId,
          hypothesisNumber,
          indexInRun: i,
          displayTitle: data.displayTitle || null,
          step2_1Summary: data.step2_1Summary || null,
          processingStatus: 'pending',
        })
        .returning();

      createdHypotheses.push(created);
    }

    return NextResponse.json({
      success: true,
      imported: createdHypotheses.length,
      hypotheses: createdHypotheses,
    });
  } catch (error) {
    console.error('Failed to import hypotheses:', error);
    return NextResponse.json(
      { error: 'Failed to import hypotheses' },
      { status: 500 }
    );
  }
}
