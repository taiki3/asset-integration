import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { hypotheses, projects } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { convertMarkdownToWord } from '@/lib/word/markdown-to-word';

interface RouteContext {
  params: Promise<{ uuid: string }>;
}

// GET /api/hypotheses/[uuid]/word - Download hypothesis report as Word document
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { uuid } = await context.params;

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get hypothesis with all data
    const [hypothesis] = await db
      .select()
      .from(hypotheses)
      .where(eq(hypotheses.uuid, uuid));

    if (!hypothesis) {
      return NextResponse.json({ error: 'Hypothesis not found' }, { status: 404 });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, hypothesis.projectId),
          eq(projects.userId, user.id),
          isNull(projects.deletedAt)
        )
      );

    if (!project) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Build the report content from all step outputs
    const reportParts: string[] = [];
    const title = hypothesis.displayTitle || `仮説 ${hypothesis.hypothesisNumber}`;

    // Add summary if exists
    if (hypothesis.step2_1Summary) {
      reportParts.push('## サマリー\n\n' + hypothesis.step2_1Summary);
    }

    // Add Step 2-2 output (Deep Research)
    if (hypothesis.step2_2Output) {
      reportParts.push('## 詳細調査 (S2-2)\n\n' + hypothesis.step2_2Output);
    }

    // Add Step 3 output (Technical Evaluation)
    if (hypothesis.step3Output) {
      reportParts.push('## テーマ魅力度評価 (S3)\n\n' + hypothesis.step3Output);
    }

    // Add Step 4 output (Entry Attractiveness)
    if (hypothesis.step4Output) {
      reportParts.push('## AGC参入検討 (S4)\n\n' + hypothesis.step4Output);
    }

    // Add Step 5 output (Integration)
    if (hypothesis.step5Output) {
      reportParts.push('## 統合評価 (S5)\n\n' + hypothesis.step5Output);
    }

    if (reportParts.length === 0) {
      return NextResponse.json(
        { error: 'No report content available for this hypothesis' },
        { status: 400 }
      );
    }

    const fullContent = reportParts.join('\n\n---\n\n');
    const docBuffer = await convertMarkdownToWord(fullContent, title);

    // Create safe filename
    const safeTitle = title
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .substring(0, 50);

    return new NextResponse(docBuffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate Word document:', error);
    return NextResponse.json(
      { error: 'Failed to generate Word document' },
      { status: 500 }
    );
  }
}
