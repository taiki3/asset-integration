import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { runs, projects, hypotheses } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// GET /api/runs/[runId]/reports/zip - Download all individual reports as ZIP
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

    // Get hypotheses for this run
    const runHypotheses = await db
      .select()
      .from(hypotheses)
      .where(
        and(
          eq(hypotheses.runId, rId),
          isNull(hypotheses.deletedAt)
        )
      )
      .orderBy(hypotheses.hypothesisNumber);

    if (runHypotheses.length === 0) {
      return NextResponse.json(
        { error: 'No hypotheses found for this run' },
        { status: 404 }
      );
    }

    // For now, return a simple JSON response with report info
    // In production, you would use a ZIP library like JSZip or archiver
    // to create an actual ZIP file with individual Word documents

    const reports = runHypotheses.map((h, index) => ({
      index: index + 1,
      hypothesisNumber: h.hypothesisNumber,
      title: h.displayTitle || `仮説 ${h.hypothesisNumber}`,
      hasContent: !!(h.step2_2Output || h.step3Output || h.step4Output || h.step5Output),
      status: h.processingStatus,
    }));

    // Return metadata about what would be in the ZIP
    // This endpoint should be enhanced with actual ZIP generation
    return NextResponse.json({
      runId: rId,
      jobName: run.jobName,
      reportCount: reports.length,
      reports,
      message: 'ZIP download functionality will be implemented',
    });
  } catch (error) {
    console.error('Failed to generate ZIP:', error);
    return NextResponse.json(
      { error: 'Failed to generate ZIP' },
      { status: 500 }
    );
  }
}
