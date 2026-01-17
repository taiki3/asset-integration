import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { runs, projects, hypotheses } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { convertMarkdownToWord } from '@/lib/word/markdown-to-word';
import archiver from 'archiver';
import { Readable } from 'stream';

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// Helper to convert stream to buffer
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// GET /api/runs/[runId]/reports/zip - Download all hypothesis reports as ZIP
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
    const [run] = await db.select().from(runs).where(eq(runs.id, rId));

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
      .where(and(eq(hypotheses.runId, rId), isNull(hypotheses.deletedAt)))
      .orderBy(hypotheses.hypothesisNumber);

    if (runHypotheses.length === 0) {
      return NextResponse.json(
        { error: 'No hypotheses found for this run' },
        { status: 404 }
      );
    }

    // Filter hypotheses that have content
    const hypothesesWithContent = runHypotheses.filter(
      (h) => h.step2_2Output || h.step3Output || h.step4Output || h.step5Output
    );

    if (hypothesesWithContent.length === 0) {
      return NextResponse.json(
        { error: 'No completed reports available for download' },
        { status: 400 }
      );
    }

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('error', (err) => {
      throw err;
    });

    // Generate Word documents for each hypothesis
    for (const hypothesis of hypothesesWithContent) {
      const reportParts: string[] = [];
      const title =
        hypothesis.displayTitle || `仮説 ${hypothesis.hypothesisNumber}`;

      if (hypothesis.step2_1Summary) {
        reportParts.push('## サマリー\n\n' + hypothesis.step2_1Summary);
      }
      if (hypothesis.step2_2Output) {
        reportParts.push('## 詳細調査 (S2-2)\n\n' + hypothesis.step2_2Output);
      }
      if (hypothesis.step3Output) {
        reportParts.push(
          '## テーマ魅力度評価 (S3)\n\n' + hypothesis.step3Output
        );
      }
      if (hypothesis.step4Output) {
        reportParts.push('## AGC参入検討 (S4)\n\n' + hypothesis.step4Output);
      }
      if (hypothesis.step5Output) {
        reportParts.push('## 統合評価 (S5)\n\n' + hypothesis.step5Output);
      }

      if (reportParts.length > 0) {
        const fullContent = reportParts.join('\n\n---\n\n');
        const docBuffer = await convertMarkdownToWord(fullContent, title);

        // Create safe filename
        const safeTitle = title
          .replace(/[/\\?%*:|"<>]/g, '-')
          .replace(/\s+/g, '_')
          .substring(0, 50);

        const filename = `${String(hypothesis.hypothesisNumber).padStart(2, '0')}_${safeTitle}.docx`;
        archive.append(docBuffer, { name: filename });
      }
    }

    // Finalize the archive
    await archive.finalize();

    // Wait for all chunks
    await new Promise<void>((resolve) => archive.on('end', resolve));
    const zipBuffer = Buffer.concat(chunks);

    // Create safe job name for filename
    const safeJobName = (run.jobName || `run-${rId}`)
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .substring(0, 30);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeJobName}_reports.zip"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate ZIP:', error);
    return NextResponse.json(
      { error: 'Failed to generate ZIP' },
      { status: 500 }
    );
  }
}
