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

  // Fetch run
  const [run] = await db
    .select()
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

  // Fetch hypotheses for this run
  const runHypotheses = await db
    .select()
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
