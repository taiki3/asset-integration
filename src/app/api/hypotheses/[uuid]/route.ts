import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { hypotheses, projects } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ uuid: string }>;
}

// GET /api/hypotheses/[uuid] - Get full hypothesis details (for detail view)
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

    return NextResponse.json(hypothesis);
  } catch (error) {
    console.error('Failed to fetch hypothesis:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hypothesis' },
      { status: 500 }
    );
  }
}
