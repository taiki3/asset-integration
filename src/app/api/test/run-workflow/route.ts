import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, resources, runs, hypotheses } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { startSimplePipeline, getRunStatus } from '@/lib/asip/simple-pipeline';

// Test endpoint for full workflow - NO AUTH for testing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      targetSpec = 'スマートフォン、自動車、建築向けの高機能ガラス市場。特に耐久性と軽量化が求められている。',
      technicalAssets = 'AGCの特殊ガラス技術：化学強化ガラス（Dragontrail）、フッ素コーティング技術、低損失光学ガラス、透明導電膜技術。',
      hypothesisCount = 3,
      jobName = 'Test Workflow'
    } = body;

    console.log('[Test Workflow] Starting test workflow...');

    // Step 1: Create or get test project
    let [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, 'test-user'))
      .limit(1);

    if (!project) {
      console.log('[Test Workflow] Creating test project...');
      [project] = await db
        .insert(projects)
        .values({
          name: 'テストプロジェクト',
          description: 'ワークフローテスト用プロジェクト',
          userId: 'test-user',
        })
        .returning();
    }

    console.log(`[Test Workflow] Using project: ${project.id}`);

    // Step 2: Create resources
    console.log('[Test Workflow] Creating resources...');

    const [targetSpecResource] = await db
      .insert(resources)
      .values({
        projectId: project.id,
        type: 'target_spec',
        name: 'テストターゲット仕様',
        content: targetSpec,
      })
      .returning();

    const [technicalAssetsResource] = await db
      .insert(resources)
      .values({
        projectId: project.id,
        type: 'technical_assets',
        name: 'テスト技術資産',
        content: technicalAssets,
      })
      .returning();

    console.log(`[Test Workflow] Created resources: target_spec=${targetSpecResource.id}, technical_assets=${technicalAssetsResource.id}`);

    // Step 3: Create run
    console.log('[Test Workflow] Creating run...');
    const [run] = await db
      .insert(runs)
      .values({
        projectId: project.id,
        jobName,
        targetSpecId: targetSpecResource.id,
        technicalAssetsId: technicalAssetsResource.id,
        hypothesisCount,
        loopCount: 1,
        modelChoice: 'pro',
        status: 'pending',
        currentStep: 0,
        currentLoop: 1,
        loopIndex: 0,
      })
      .returning();

    console.log(`[Test Workflow] Created run: ${run.id}`);

    // Step 4: Start pipeline in background
    console.log('[Test Workflow] Starting pipeline...');
    startSimplePipeline(run.id).catch((error) => {
      console.error(`[Test Workflow] Pipeline failed:`, error);
    });

    return NextResponse.json({
      status: 'started',
      runId: run.id,
      projectId: project.id,
      message: 'ワークフローを開始しました。ステータスはGETで確認できます。',
      checkStatus: `/api/test/run-workflow?runId=${run.id}`,
    });
  } catch (error) {
    console.error('[Test Workflow] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check run status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runIdParam = searchParams.get('runId');

    if (!runIdParam) {
      // List recent runs
      const recentRuns = await db
        .select()
        .from(runs)
        .orderBy(desc(runs.createdAt))
        .limit(10);

      return NextResponse.json({
        runs: recentRuns.map(r => ({
          id: r.id,
          jobName: r.jobName,
          status: r.status,
          currentStep: r.currentStep,
          createdAt: r.createdAt,
          completedAt: r.completedAt,
        })),
      });
    }

    const runId = parseInt(runIdParam, 10);
    if (isNaN(runId)) {
      return NextResponse.json(
        { error: 'Invalid runId' },
        { status: 400 }
      );
    }

    // Get run status
    const status = await getRunStatus(runId);

    // Get hypotheses for this run
    const runHypotheses = await db
      .select()
      .from(hypotheses)
      .where(eq(hypotheses.runId, runId));

    return NextResponse.json({
      runId,
      ...status,
      hypotheses: runHypotheses.map(h => ({
        uuid: h.uuid,
        title: h.displayTitle,
        status: h.processingStatus,
        hasStep2_2: !!h.step2_2Output,
        hasStep3: !!h.step3Output,
        hasStep4: !!h.step4Output,
        hasStep5: !!h.step5Output,
      })),
    });
  } catch (error) {
    console.error('[Test Workflow] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}