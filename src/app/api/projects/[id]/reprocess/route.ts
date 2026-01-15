import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, resources, runs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getBaseUrl, getInternalApiHeaders } from '@/lib/utils/get-base-url';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/reprocess - Create a reprocess run
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
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
    const {
      uploadedContent,
      technicalAssetsId,
      hypothesisCount,
      modelChoice,
      customPrompt,
      jobName,
    } = body;

    if (!uploadedContent?.trim()) {
      return NextResponse.json(
        { error: 'Uploaded content is required' },
        { status: 400 }
      );
    }

    if (!jobName?.trim()) {
      return NextResponse.json(
        { error: 'Job name is required' },
        { status: 400 }
      );
    }

    // Verify technical assets exist if provided
    if (technicalAssetsId) {
      const [techAssets] = await db
        .select()
        .from(resources)
        .where(
          and(
            eq(resources.id, technicalAssetsId),
            eq(resources.projectId, projectId),
            eq(resources.type, 'technical_assets')
          )
        );

      if (!techAssets) {
        return NextResponse.json(
          { error: 'Technical assets not found' },
          { status: 400 }
        );
      }
    }

    // Store reprocess config in progressInfo
    const reprocessConfig = {
      mode: 'reprocess' as const,
      uploadedContent,
      customPrompt: customPrompt || null,
    };

    const [run] = await db
      .insert(runs)
      .values({
        projectId,
        jobName: `[再処理] ${jobName.trim()}`,
        targetSpecId: null, // Reprocess doesn't use target spec, uses uploaded content
        technicalAssetsId: technicalAssetsId || null,
        hypothesisCount: hypothesisCount || 5,
        loopCount: 1,
        modelChoice: modelChoice || 'pro',
        status: 'pending',
        currentStep: 0,
        currentLoop: 1,
        loopIndex: 0,
        progressInfo: reprocessConfig,
      })
      .returning();

    // Start the reprocess pipeline via process endpoint
    // Note: Reprocess mode is detected via progressInfo.mode === 'reprocess'
    const baseUrl = getBaseUrl();
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      after(async () => {
        try {
          console.log(`[Reprocess] Triggering pipeline for run ${run.id}`);
          const response = await fetch(`${baseUrl}/api/runs/${run.id}/process`, {
            method: 'POST',
            headers: getInternalApiHeaders(cronSecret),
          });

          if (!response.ok) {
            throw new Error(`Process API returned ${response.status}`);
          }
        } catch (error) {
          console.error(`Failed to start reprocess pipeline for run ${run.id}:`, error);
          try {
            await db
              .update(runs)
              .set({
                status: 'error',
                errorMessage: `パイプライン起動失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
              })
              .where(eq(runs.id, run.id));
          } catch (dbError) {
            console.error(`Failed to update run status:`, dbError);
          }
        }
      });
    } else {
      console.warn(`[Reprocess] CRON_SECRET not set, pipeline will not start automatically`);
    }

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error('Failed to create reprocess run:', error);
    return NextResponse.json(
      { error: 'Failed to create reprocess run' },
      { status: 500 }
    );
  }
}
