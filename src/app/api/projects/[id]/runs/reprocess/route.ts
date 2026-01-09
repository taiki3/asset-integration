import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, runs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { startPipeline } from '@/lib/asip/pipeline';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/runs/reprocess - Create a reprocess run
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    const isMockMode = process.env.NEXT_PUBLIC_MOCK_AUTH === 'true';

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      uploadedContent, 
      technicalAssetsId, 
      hypothesisCount, 
      modelChoice, 
      customPrompt, 
      jobName 
    } = body;

    if (!uploadedContent || !technicalAssetsId || !jobName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // In mock mode, simulate reprocess
    if (isMockMode) {
      const mockRun = {
        id: Date.now(),
        projectId,
        targetSpecId: null,
        technicalAssetsId,
        jobName: `[再処理] ${jobName}`,
        hypothesisCount: hypothesisCount || 5,
        modelChoice: modelChoice || 'pro',
        status: 'running',
        createdAt: new Date(),
      };
      
      // TODO: Add to mock runs
      return NextResponse.json(mockRun, { status: 201 });
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

    // Create a run record
    const [run] = await db
      .insert(runs)
      .values({
        projectId,
        targetSpecId: null, // Reprocess doesn't need target spec
        technicalAssetsId,
        jobName: `[再処理] ${jobName}`,
        hypothesisCount: hypothesisCount || 5,
        loopCount: 1,
        loopIndex: 0,
        modelChoice: modelChoice || 'pro',
        status: 'pending',
        currentStep: 0,
        currentLoop: 1,
      })
      .returning();

    // Start the pipeline with reprocess mode
    await startPipeline(run.id, {
      reprocessMode: true,
      uploadedContent,
      customPrompt,
    });

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error('Failed to create reprocess run:', error);
    return NextResponse.json(
      { error: 'Failed to create reprocess run' },
      { status: 500 }
    );
  }
}