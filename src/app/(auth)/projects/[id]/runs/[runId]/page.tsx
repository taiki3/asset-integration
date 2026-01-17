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

  // Parallel fetch: auth + project + run + hypotheses (all independent)
  const [user, projectResults, runResults, runHypotheses] = await Promise.all([
    getUser(),
    db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          isNull(projects.deletedAt)
        )
      ),
    db
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
      })
      .from(runs)
      .where(
        and(
          eq(runs.id, rId),
          eq(runs.projectId, projectId)
        )
      ),
    db
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
      })
      .from(hypotheses)
      .where(eq(hypotheses.runId, rId))
      .orderBy(desc(hypotheses.createdAt)),
  ]);

  if (!user) {
    notFound();
  }

  // Verify ownership
  const project = projectResults.find(p => p.userId === user.id);
  if (!project) {
    notFound();
  }

  const run = runResults[0];
  if (!run) {
    notFound();
  }

  // Fetch associated resources in parallel (depends on run data)
  const [targetSpecResult, technicalAssetsResult] = await Promise.all([
    run.targetSpecId
      ? db.select().from(resources).where(eq(resources.id, run.targetSpecId))
      : Promise.resolve([]),
    run.technicalAssetsId
      ? db.select().from(resources).where(eq(resources.id, run.technicalAssetsId))
      : Promise.resolve([]),
  ]);

  const runResources = {
    targetSpec: targetSpecResult[0] || null,
    technicalAssets: technicalAssetsResult[0] || null,
  };

  return (
    <RunDetailView
      project={project}
      run={run}
      resources={runResources}
      hypotheses={runHypotheses}
    />
  );
}
