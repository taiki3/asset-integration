import { notFound } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, resources, runs } from '@/lib/db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { ProjectWorkspace } from '@/components/project/project-workspace';
import { mockProjects, mockResources, mockRuns } from '@/lib/db/mock';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const useMockDb = process.env.USE_MOCK_DB === 'true';
  const projectId = parseInt(id, 10);

  // Parallel fetch: auth + all data queries
  const [user, projectResult, projectResources, projectRuns] = await Promise.all([
    getUser(),
    useMockDb
      ? Promise.resolve(mockProjects.find(p => p.id === projectId))
      : db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, projectId),
              isNull(projects.deletedAt)
            )
          )
          .then(results => results[0]),
    useMockDb
      ? Promise.resolve(mockResources.filter(r => r.projectId === projectId))
      : db
          .select()
          .from(resources)
          .where(eq(resources.projectId, projectId)),
    useMockDb
      ? Promise.resolve(mockRuns.filter(r => r.projectId === projectId))
      : db
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
            errorMessage: runs.errorMessage,
            createdAt: runs.createdAt,
            updatedAt: runs.updatedAt,
            completedAt: runs.completedAt,
          })
          .from(runs)
          .where(eq(runs.projectId, projectId))
          .orderBy(desc(runs.createdAt))
          .limit(20),
  ]);

  if (!user) {
    notFound();
  }

  // Verify ownership
  const project = projectResult && projectResult.userId === user.id ? projectResult : null;

  if (!project) {
    notFound();
  }

  return (
    <ProjectWorkspace
      project={project}
      initialResources={projectResources}
      initialRuns={projectRuns}
    />
  );
}