import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, resources, runs } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { createMockRun, getMockRuns } from '@/lib/api-mock';
import { mockProjects } from '@/lib/db/mock';
import { getBaseUrl, getInternalApiHeaders } from '@/lib/utils/get-base-url';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/runs - List runs for a project
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const useMockDb = process.env.USE_MOCK_DB === 'true';

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use mock data only if USE_MOCK_DB is true
    if (useMockDb) {
      const projectId = parseInt(id, 10);
      const project = mockProjects.find(p => p.id === projectId && p.userId === user.id);
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const projectRuns = getMockRuns(id);
      return NextResponse.json(projectRuns);
    }

    // Production mode with database
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

    const projectRuns = await db
      .select()
      .from(runs)
      .where(eq(runs.projectId, projectId))
      .orderBy(desc(runs.createdAt));

    return NextResponse.json(projectRuns);
  } catch (error) {
    console.error('Failed to fetch runs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch runs' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/runs - Create a new run
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const useMockDb = process.env.USE_MOCK_DB === 'true';

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use mock data only if USE_MOCK_DB is true
    if (useMockDb) {
      const projectId = parseInt(id, 10);
      const project = mockProjects.find(p => p.id === projectId && p.userId === user.id);
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const body = await request.json();
      const { jobName, targetSpecId, technicalAssetsId } = body;

      if (!jobName?.trim()) {
        return NextResponse.json({ error: 'Job name is required' }, { status: 400 });
      }

      const run = await createMockRun(id, [targetSpecId], [technicalAssetsId], jobName);
      return NextResponse.json(run, { status: 201 });
    }

    // Production mode with database
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
    const { jobName, targetSpecId, technicalAssetsId, hypothesisCount, loopCount, modelChoice, existingFilter } = body;

    if (!jobName?.trim()) {
      return NextResponse.json(
        { error: 'Job name is required' },
        { status: 400 }
      );
    }

    // Verify resources exist and belong to project
    if (targetSpecId) {
      const [targetSpec] = await db
        .select()
        .from(resources)
        .where(
          and(
            eq(resources.id, targetSpecId),
            eq(resources.projectId, projectId),
            eq(resources.type, 'target_spec')
          )
        );

      if (!targetSpec) {
        return NextResponse.json(
          { error: 'Target spec not found' },
          { status: 400 }
        );
      }
    }

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

    // Store existingFilter in progressInfo for use during pipeline execution
    const initialProgressInfo = existingFilter?.enabled
      ? { existingFilter }
      : undefined;

    const [run] = await db
      .insert(runs)
      .values({
        projectId,
        jobName: jobName.trim(),
        targetSpecId: targetSpecId || null,
        technicalAssetsId: technicalAssetsId || null,
        hypothesisCount: hypothesisCount || 5,
        loopCount: loopCount || 1,
        modelChoice: modelChoice || 'pro',
        status: 'pending',
        currentStep: 0,
        currentLoop: 1,
        loopIndex: 0,
        progressInfo: initialProgressInfo,
      })
      .returning();

    // Start the pipeline via process endpoint (self-chaining)
    const baseUrl = getBaseUrl();
    const cronSecret = process.env.CRON_SECRET;

    console.log(`[Runs] About to trigger pipeline - baseUrl: ${baseUrl}, CRON_SECRET set: ${!!cronSecret}, length: ${cronSecret?.length || 0}`);

    if (cronSecret) {
      after(async () => {
        try {
          const targetUrl = `${baseUrl}/api/runs/${run.id}/process`;
          const headers = getInternalApiHeaders(cronSecret);
          console.log(`[Runs] Calling: ${targetUrl}`);
          console.log(`[Runs] Headers: ${JSON.stringify(Object.keys(headers))}`);
          console.log(`[Runs] Bypass secret set: ${!!headers['x-vercel-protection-bypass']}`);

          const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            redirect: 'manual', // Don't follow redirects (protection might redirect)
          });

          console.log(`[Runs] Response status: ${response.status}, type: ${response.type}`);
          console.log(`[Runs] Content-Type: ${response.headers.get('content-type')}`);

          // Check for redirect (Vercel Protection redirect)
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            throw new Error(`Redirected to ${location} - Vercel Deployment Protection may be blocking. Check VERCEL_AUTOMATION_BYPASS_SECRET.`);
          }

          if (!response.ok) {
            const body = await response.text();
            throw new Error(`Process API returned ${response.status}: ${body}`);
          }

          // Verify response is JSON, not HTML protection page
          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('application/json')) {
            const body = await response.text();
            throw new Error(`Expected JSON but got ${contentType}. Body: ${body.substring(0, 200)}`);
          }
        } catch (error) {
          console.error(`Failed to start pipeline for run ${run.id}:`, error);
          // Update run status to error if pipeline fails to start
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
      console.warn(`[Runs] CRON_SECRET not set, pipeline will not start automatically`);
    }

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error('Failed to create run:', error);
    return NextResponse.json(
      { error: 'Failed to create run' },
      { status: 500 }
    );
  }
}
