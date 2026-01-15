import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { runs, projects, hypotheses } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// GET /api/runs/[runId]/download - Download run data in various formats
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { runId } = await context.params;
    const rId = parseInt(runId, 10);
    const format = request.nextUrl.searchParams.get('format') || 'tsv';

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

    if (run.status !== 'completed') {
      return NextResponse.json(
        { error: 'Run not completed' },
        { status: 400 }
      );
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

    if (format === 'tsv') {
      // Generate TSV
      const headers = ['番号', 'タイトル', '概要', 'ステータス'];
      const rows = runHypotheses.map((h) => [
        h.hypothesisNumber,
        h.displayTitle || '',
        h.step2_1Summary || '',
        h.processingStatus || 'pending',
      ]);

      const tsv = [
        headers.join('\t'),
        ...rows.map((row) => row.join('\t')),
      ].join('\n');

      // Encode filename for Content-Disposition (RFC 5987)
      const baseFilename = `run-${rId}.tsv`;
      const encodedFilename = encodeURIComponent(`${run.jobName || 'run'}-${rId}.tsv`);

      return new NextResponse(tsv, {
        headers: {
          'Content-Type': 'text/tab-separated-values; charset=utf-8',
          'Content-Disposition': `attachment; filename="${baseFilename}"; filename*=UTF-8''${encodedFilename}`,
        },
      });
    }

    if (format === 'excel') {
      // For Excel, we'd need a library like xlsx
      // For now, return TSV with xlsx extension hint
      const headers = ['番号', 'タイトル', '概要', 'ステータス'];
      const rows = runHypotheses.map((h) => [
        h.hypothesisNumber,
        h.displayTitle || '',
        h.step2_1Summary || '',
        h.processingStatus || 'pending',
      ]);

      const csv = [
        headers.join(','),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      // Encode filename for Content-Disposition (RFC 5987)
      const csvBaseFilename = `run-${rId}.csv`;
      const csvEncodedFilename = encodeURIComponent(`${run.jobName || 'run'}-${rId}.csv`);

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${csvBaseFilename}"; filename*=UTF-8''${csvEncodedFilename}`,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
  } catch (error) {
    console.error('Failed to download run:', error);
    return NextResponse.json(
      { error: 'Failed to download run' },
      { status: 500 }
    );
  }
}
