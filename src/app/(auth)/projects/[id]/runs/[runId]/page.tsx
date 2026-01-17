import { notFound } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, runs, resources, hypotheses } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { RunDetailView } from '@/components/run/run-detail-view';

interface Props {
  params: Promise<{ id: string; runId: string }>;
}

export default async function RunDetailPage({ params }: Props) {
  const { id, runId } = await params;
  const projectId = parseInt(id, 10);
  const rId = parseInt(runId, 10);

  if (isNaN(projectId) || isNaN(rId)) {
    notFound();
  }

  const user = await getUser();
  if (!user) {
    notFound();
  }

  // Fetch project
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
    notFound();
  }

  // Fetch run (exclude heavy step outputs for initial load)
  const [run] = await db
    .select({
      id: runs.id,
      projectId: runs.projectId,
      targetSpecId: runs.targetSpecId,
      technicalAssetsId: runs.technicalAssetsId,
      jobName: runs.jobName,
      hypothesisCount: runs.hypothesisCount,
      loopCount: runs.loopCount,
      loopIndex: runs.loopIndex,
      modelChoice: runs.modelChoice,
      status: runs.status,
      currentStep: runs.currentStep,
      currentLoop: runs.currentLoop,
      progressInfo: runs.progressInfo,
      debugPrompts: runs.debugPrompts,
      errorMessage: runs.errorMessage,
      createdAt: runs.createdAt,
      updatedAt: runs.updatedAt,
      completedAt: runs.completedAt,
      // Exclude heavy columns: step*IndividualOutputs, integratedList, executionTiming, geminiInteractions
    })
    .from(runs)
    .where(
      and(
        eq(runs.id, rId),
        eq(runs.projectId, projectId)
      )
    );

  if (!run) {
    notFound();
  }

  // Fetch associated resources
  const runResources = {
    targetSpec: run.targetSpecId
      ? (await db.select().from(resources).where(eq(resources.id, run.targetSpecId)))[0]
      : null,
    technicalAssets: run.technicalAssetsId
      ? (await db.select().from(resources).where(eq(resources.id, run.technicalAssetsId)))[0]
      : null,
  };

  // Fetch hypotheses for this run (light columns for sidebar - full data loaded on demand)
  const runHypotheses = await db
    .select({
      id: hypotheses.id,
      uuid: hypotheses.uuid,
      projectId: hypotheses.projectId,
      runId: hypotheses.runId,
      hypothesisNumber: hypotheses.hypothesisNumber,
      indexInRun: hypotheses.indexInRun,
      displayTitle: hypotheses.displayTitle,
      contentHash: hypotheses.contentHash,
      step2_1Summary: hypotheses.step2_1Summary,
      processingStatus: hypotheses.processingStatus,
      currentInteractionId: hypotheses.currentInteractionId,
      errorMessage: hypotheses.errorMessage,
      createdAt: hypotheses.createdAt,
      deletedAt: hypotheses.deletedAt,
      // Exclude heavy columns: step2_2Output, step3Output, step4Output, step5Output, fullData
    })
    .from(hypotheses)
    .where(eq(hypotheses.runId, rId))
    .orderBy(desc(hypotheses.createdAt));

  return (
    <RunDetailView
      project={project}
      run={run}
      resources={runResources}
      hypotheses={runHypotheses}
    />
  );
}
