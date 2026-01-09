import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hypotheses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ uuid: string }>;
}

// GET /api/test/hypotheses/[uuid] - Get hypothesis details
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { uuid } = await context.params;

    const [hypothesis] = await db
      .select()
      .from(hypotheses)
      .where(eq(hypotheses.uuid, uuid));

    if (!hypothesis) {
      return NextResponse.json(
        { error: 'Hypothesis not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      uuid: hypothesis.uuid,
      title: hypothesis.displayTitle,
      hypothesisNumber: hypothesis.hypothesisNumber,
      status: hypothesis.processingStatus,
      steps: {
        step2_1: {
          summary: hypothesis.step2_1Summary,
        },
        step2_2: {
          output: hypothesis.step2_2Output,
          completed: !!hypothesis.step2_2Output,
        },
        step3: {
          output: hypothesis.step3Output,
          completed: !!hypothesis.step3Output,
        },
        step4: {
          output: hypothesis.step4Output,
          completed: !!hypothesis.step4Output,
        },
        step5: {
          output: hypothesis.step5Output,
          completed: !!hypothesis.step5Output,
        },
      },
      error: hypothesis.errorMessage,
      createdAt: hypothesis.createdAt,
    });
  } catch (error) {
    console.error('Error fetching hypothesis:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}