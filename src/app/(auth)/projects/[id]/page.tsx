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

  const user = await getUser();
  if (!user) {
    notFound();
  }

  // Use mock data only if USE_MOCK_DB is true
  const projectId = parseInt(id, 10);
  const project = useMockDb
    ? mockProjects.find(p => p.id === projectId && p.userId === user.id)
    : await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.userId, user.id),
            isNull(projects.deletedAt)
          )
        )
        .then(results => results[0]);

  if (!project) {
    notFound();
  }

  // Initial data fetch - client component will handle real-time updates
  const projectResources = useMockDb
    ? mockResources.filter(r => r.projectId === project.id)
    : await db
        .select()
        .from(resources)
        .where(eq(resources.projectId, projectId));

  // Fetch runs with light columns (exclude heavy step outputs)
  const projectRuns = useMockDb
    ? mockRuns.filter(r => r.projectId === project.id)
    : await db
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
        .limit(20);

  return (
    <ProjectWorkspace
      project={project}
      initialResources={projectResources}
      initialRuns={projectRuns}
    />
  );
}